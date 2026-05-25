"use client";

import { useEffect, useRef, useState } from "react";
import { AttemptStateBadge } from "@/components/attempt-state-badge";
import { CountdownTimer } from "@/components/countdown-timer";
import { QuestionNavigator } from "@/components/question-navigator";
import { QuestionPaper } from "@/components/question-paper";
import { TelemetryListener } from "@/components/telemetry-listener";
import { UploadSlotCard } from "@/components/upload-slot-card";
import { SubmitExamButton } from "@/components/submit-exam-button";
import { ServerTimeVerificationCard } from "@/components/student/server-time-verification-card";
import { StudentMaterialsDrawer } from "@/components/student/allowed-materials-drawer";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { flattenQuestionNodes, normalizedPackageSchema } from "@/lib/assessment-package";
import type { AttemptScreenData } from "@/lib/attempt-screen-data";
import type { StudentUploadCompletion } from "@/lib/student-upload-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import { collectUploadSlotNodeIds } from "@/lib/upload-slots";
import type { StudentMaterial } from "@/lib/student-experience";

function LastSavedBadge({ responses }: { responses: { saved_at: string }[] }) {
  if (responses.length === 0) return <Badge tone="neutral">Not saved yet</Badge>;
  const latest = [...responses].sort((a, b) => Date.parse(b.saved_at) - Date.parse(a.saved_at))[0];
  const time = new Date(latest.saved_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  return <Badge tone="success">Last saved {time} UTC</Badge>;
}

export function ExamWorkspace({ 
  attemptId, 
  initialScreenData,
  materials = [],
}: { 
  attemptId: string; 
  initialScreenData: AttemptScreenData;
  materials?: StudentMaterial[];
}) {
  const [screenData, setScreenData] = useState<AttemptScreenData>(initialScreenData);
  const [isLoadingPackage, setIsLoadingPackage] = useState(!initialScreenData.package);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attemptSessionId, setAttemptSessionId] = useState<string | undefined>();
  const sessionStarted = useRef(false);

  useEffect(() => {
    if (sessionStarted.current) return;
    sessionStarted.current = true;

    async function startSessionAndLoadPackage() {
      setLoadError(null);
      const supabase = createSupabaseBrowserClient();
      let freshStateToken = initialScreenData.stateToken;
      let sessionId: string | undefined;

      try {
        const session = await invokeEdgeFunction<{ attempt_session_id: string }>(supabase, "start-attempt-session", {
          body: { attempt_id: attemptId },
        });
        sessionId = session?.attempt_session_id;
        setAttemptSessionId(sessionId);
        if (sessionId) {
          const state = await invokeEdgeFunction<{ state_token: string; server_now_utc: string; countdown_target_utc: string | null }>(
            supabase,
            "get-attempt-state",
            { body: { attempt_id: attemptId, attempt_session_id: sessionId } },
          );
          if (state?.state_token) {
            freshStateToken = state.state_token;
            setScreenData((prev) => ({
              ...prev,
              stateToken: state.state_token,
              attempt: {
                ...prev.attempt,
                server_now_utc: state.server_now_utc,
                countdown_target_utc: state.countdown_target_utc,
              },
            }));
          }
        }
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Could not start attempt session.");
      }

      // If the package is already present and this is standard Browser Mode, the
      // session wiring above is enough for telemetry and subsequent token refreshes.
      if (screenData.package && initialScreenData.attempt.delivery_mode !== "seb_required") return;

      setIsLoadingPackage(true);

      try {
        if (initialScreenData.attempt.delivery_mode === "seb_required") {
          if (!sessionId) throw new Error("Could not create a session-bound SEB verification token.");
          const sebEvidence = await readSebJsApiEvidence();
          await invokeEdgeFunction(supabase, "seb-verify-session", {
            body: {
              attempt_id: attemptId,
              attempt_session_id: sessionId,
              state_token: freshStateToken,
              ...(sebEvidence
                ? {
                    mode: "js_api",
                    browser_exam_request_hash: sebEvidence.browserExamRequestHash,
                    config_key_request_hash: sebEvidence.configKeyRequestHash,
                    page_url: window.location.href,
                    seb_version: sebEvidence.version,
                  }
                : { mode: "header" }),
            },
          });
        }

        const response = await invokeEdgeFunction<{ assessment_package: unknown; asset_urls?: Record<string, string> }>(supabase, "get-attempt-package", {
          body: { 
            attempt_id: attemptId, 
            state_token: freshStateToken,
          },
        });

        if (!response?.assessment_package) {
          throw new Error("The server did not return an exam package.");
        }

        const parsed = normalizedPackageSchema.safeParse(response.assessment_package);
        if (!parsed.success) {
          if (process.env.NODE_ENV !== "production") {
            console.error("Package validation failed:", parsed.error.format());
          }
          throw new Error(`Released package failed schema validation: ${parsed.error.issues[0]?.path.join(".") || "unknown field"} is ${parsed.error.issues[0]?.message || "invalid"}`);
        }

        setScreenData(prev => ({
          ...prev,
          package: parsed.data,
          assetUrls: response.asset_urls ?? {},
          stateToken: freshStateToken,
          packageError: null
        }));
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Verification failed.");
      } finally {
        setIsLoadingPackage(false);
      }
    }

    void startSessionAndLoadPackage();
  }, [attemptId, initialScreenData.stateToken, screenData.package, initialScreenData.attempt.delivery_mode]);

  const { attempt, package: assessmentPackage, packageError, stateToken, assetUrls, responses, sebConfigUrl, annotations, uploadSlots } = screenData;

  // Show "Verifying..." if we are fetching the package on the client
  if (isLoadingPackage) {
    const isSeb = initialScreenData.attempt.delivery_mode === "seb_required";
    return (
      <section className="mx-auto grid max-w-[760px] gap-4 rounded-lg border border-[var(--border)] bg-white p-6">
        <AttemptStateBadge state={attempt.state} />
        <h1 className="text-xl font-semibold text-[var(--ink)]">
          {isSeb ? "Verifying Exam Environment..." : "Unlocking Exam Content..."}
        </h1>
        <p className="text-sm leading-6 text-[var(--muted)] italic">
          {isSeb 
            ? "Checking Safe Exam Browser security keys and unlocking assessment content. Please wait."
            : "Decrypting and preparing your exam package. Please wait."}
        </p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
          <div className="h-full w-1/3 animate-[shimmer_1.5s_infinite] bg-[var(--ink)]" />
        </div>
      </section>
    );
  }

  // Show error screen if the package is missing after attempt
  if (!assessmentPackage) {
    return (
      <section className="mx-auto grid max-w-[760px] gap-4 rounded-lg border border-[var(--border)] bg-white p-6 shadow-sm">
        <AttemptStateBadge state={attempt.state} />
        <div>
          <h1 className="text-xl font-semibold text-[var(--ink)]">
            {attempt.delivery_mode === "seb_required" ? "Safe Exam Browser Required" : "Exam content is not available yet"}
          </h1>
          <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-700 border border-red-100">
            <p className="font-bold">Verification Error:</p>
            <p>{loadError || packageError || "The server has not released the exam package for this attempt state."}</p>
          </div>

          {attempt.delivery_mode === "seb_required" && (
            <div className="mt-4 space-y-4">
              <p className="text-sm leading-6 text-[var(--muted)]">
                This exam is locked to a specific Safe Exam Browser configuration. Open this attempt in SEB with the final
                configuration file, then refresh this page inside SEB. Normal browsers cannot release this exam package.
              </p>
              {sebConfigUrl && (
                <div className="flex flex-col gap-3 sm:flex-row border-t border-[var(--border)] pt-4 mt-4">
                  <a 
                    href={sebConfigUrl} 
                    className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--border)] px-4 text-sm font-medium text-[var(--ink)] hover:bg-[var(--surface-muted)] transition-colors"
                  >
                    Download .seb Configuration
                  </a>
                  <p className="text-xs text-[var(--subtle)] max-w-xs">
                    Otherwise, download and open this file to launch Safe Exam Browser automatically.
                  </p>
                </div>
              )}
            </div>
          )}
          <p className="mt-6 text-xs text-[var(--muted)] border-t border-[var(--border)] pt-4">
            If you are already inside SEB and seeing this error, ensure your network allows access to the verification server.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/student">Back to assigned attempts</ButtonLink>
        </div>
      </section>
    );
  }

  const rootUploadNodeIds = new Set(collectUploadSlotNodeIds(assessmentPackage.questions));
  const uploadNodes = flattenQuestionNodes(assessmentPackage.questions).filter((node) =>
    rootUploadNodeIds.has(node.node_id),
  );

  function handleUploadComplete(completion: StudentUploadCompletion) {
    setScreenData((prev) => {
      const existingIndex = prev.uploadSlots.findIndex((slot) => slot.question_node_id === completion.questionNodeId);
      const nextSlot = {
        ...(existingIndex >= 0
          ? prev.uploadSlots[existingIndex]
          : {
              id: completion.questionNodeId,
              attempt_id: attemptId,
              question_node_id: completion.questionNodeId,
              required: false,
              is_blank_placeholder: false,
              annotated_object_path: null,
              annotated_generated_at: null,
              created_at: completion.uploadedAt,
              updated_at: completion.uploadedAt,
            }),
        object_path: completion.objectPath,
        original_file_name: completion.fileName,
        uploaded_at: completion.uploadedAt,
        file_size_bytes: completion.fileSizeBytes,
        content_type: completion.contentType,
        confirmed_by_profile_id: null,
        locked_at: completion.uploadedAt,
        status: "uploaded" as const,
      };
      const nextSlots = existingIndex >= 0
        ? prev.uploadSlots.map((slot, index) => (index === existingIndex ? nextSlot : slot))
        : [...prev.uploadSlots, nextSlot];
      return { ...prev, uploadSlots: nextSlots };
    });
  }

  return (
    <div className="exam-mode">
      <TelemetryListener attemptId={attemptId} attemptSessionId={attemptSessionId} stateToken={stateToken} />
      <header className="sticky top-0 z-10 -mx-5 mb-8 border-b border-[var(--border)] bg-[rgba(246,249,255,0.96)] px-5 py-3 backdrop-blur md:-mx-8 md:px-8">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AttemptStateBadge state="ACTIVE" />
            <div>
              <h1 className="font-semibold">{assessmentPackage.assessment.title}</h1>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--subtle)]">
                {assessmentPackage.assessment.paper_code} · {attempt.delivery_mode === "seb_required" ? "Safe Exam Browser Mode" : "Browser Mode (Standard)"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ServerTimeVerificationCard serverNowUtc={attempt.server_now_utc} timezone={attempt.display_timezone} compact />
            <LastSavedBadge responses={responses} />
            <CountdownTimer
              serverNowUtc={attempt.server_now_utc}
              targetUtc={attempt.countdown_target_utc}
              state="ACTIVE"
            />
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1540px] gap-8 lg:grid-cols-[240px_1fr] xl:grid-cols-[240px_1fr_320px]">
        <div className="hidden lg:sticky lg:top-28 lg:block lg:self-start">
          <QuestionNavigator questions={assessmentPackage.questions} />
        </div>
        <QuestionPaper 
          questions={assessmentPackage.questions} 
          attemptId={attemptId}
          ownerProfileId={attempt.owner_profile_id}
          stateToken={stateToken}
          assetUrls={assetUrls}
          responses={responses}
          annotations={annotations}
          uploadSlots={uploadSlots}
          onUploadComplete={handleUploadComplete}
        />
        <aside className="grid content-start gap-4 xl:sticky xl:top-28 xl:self-start" aria-label="Response tools">
          <StudentMaterialsDrawer materials={materials} />
          <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-[var(--ink)]">Response panel</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Typed answers autosave during ACTIVE. Upload URLs are issued one slot at a time.
            </p>
            <SubmitExamButton attemptId={attemptId} stateToken={stateToken} className="mt-4" />
            <div className="mt-3 flex flex-wrap gap-2">
              <ButtonLink href={`/student/attempts/${attemptId}/recovery-status`} variant="secondary">Report issue</ButtonLink>
              <ButtonLink href={`/student/attempts/${attemptId}/finalize`} variant="secondary">Finalization checklist</ButtonLink>
            </div>
          </section>
          <div className="lg:hidden">
            <QuestionNavigator questions={assessmentPackage.questions} />
          </div>
          {uploadNodes.map((node) => (
            <UploadSlotCard
              key={node.node_id}
              attemptId={attemptId}
              questionNodeId={node.node_id}
              questionKey={node.node_key}
              stateToken={stateToken}
              status="pending"
              slot={uploadSlots.find((slot) => slot.question_node_id === node.node_id)}
              onUploadComplete={handleUploadComplete}
            />
          ))}
          <section className="rounded-lg border border-[var(--border)] bg-white p-4 text-sm leading-6 text-[var(--muted)] shadow-sm">
            Browser telemetry is moderation evidence only. It does not prove cheating.
          </section>
        </aside>
      </div>
    </div>
  );
}

async function readSebJsApiEvidence() {
  type SebApi = {
    version?: string;
    security?: {
      updateKeys?: (callback: () => void) => void;
      browserExamKey?: string;
      configKey?: string;
    };
  };
  const seb = (window as unknown as { SafeExamBrowser?: SebApi }).SafeExamBrowser;
  if (!seb?.security) return null;

  if (seb.security.updateKeys) {
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      seb.security?.updateKeys?.(finish);
      window.setTimeout(finish, 800);
    });
  }

  const browserExamRequestHash = seb.security.browserExamKey?.trim() || null;
  const configKeyRequestHash = seb.security.configKey?.trim() || null;
  if (!browserExamRequestHash || !configKeyRequestHash) return null;
  return {
    browserExamRequestHash,
    configKeyRequestHash,
    version: seb.version,
  };
}
