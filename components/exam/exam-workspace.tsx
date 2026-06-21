"use client";

import { useEffect, useRef, useState } from "react";
import { AttemptStateBadge } from "@/components/attempt-state-badge";
import { AccommodationSummary } from "@/components/exam/accommodation-summary";
import { StudentInvigilationMessages, type StudentInvigilationMessage } from "@/components/exam/student-invigilation-messages";
import { CountdownTimer } from "@/components/countdown-timer";
import { QuestionNavigator } from "@/components/question-navigator";
import { QuestionPaper } from "@/components/question-paper";
import { TelemetryListener } from "@/components/telemetry-listener";
import { SubmitExamButton } from "@/components/submit-exam-button";
import { ServerTimeVerificationCard } from "@/components/student/server-time-verification-card";
import { StudentMaterialsDrawer } from "@/components/student/allowed-materials-drawer";
import {
  ExamWorkspaceControls,
  KeyboardShortcutsPanel,
  PinnedMaterialsPanel,
  ReconnectRecoveryBanner,
  UploadQueueDrawer,
  type ExamLayoutMode,
} from "@/components/student/exam-ops-panels";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { flattenQuestionNodes, normalizedPackageSchema } from "@/lib/assessment-package";
import type { AttemptScreenData } from "@/lib/attempt-screen-data";
import type { StudentUploadCompletion } from "@/lib/student-upload-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import { collectUploadSlotNodeIds } from "@/lib/upload-slots";
import type { StudentAccommodationPolicy } from "@/lib/examsim/accommodations";
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
  const [layoutMode, setLayoutMode] = useState<ExamLayoutMode>("standard");
  const [toolsOpen, setToolsOpen] = useState(true);
  const [invigilationMessages, setInvigilationMessages] = useState<StudentInvigilationMessage[]>([]);
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
          const state = await invokeEdgeFunction<{
            state: AttemptScreenData["attempt"]["state"];
            state_token: string;
            server_now_utc: string;
            countdown_target_utc: string | null;
            accommodation_policy: StudentAccommodationPolicy;
            invigilation_messages?: StudentInvigilationMessage[];
          }>(
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
                 state: state.state,
                 server_now_utc: state.server_now_utc,
                countdown_target_utc: state.countdown_target_utc,
              },
              accommodationPolicy: state.accommodation_policy ?? prev.accommodationPolicy,
            }));
            setInvigilationMessages(state.invigilation_messages ?? []);
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

  useEffect(() => {
    if (!attemptSessionId) return;
    let cancelled = false;

    async function refreshServerState() {
      try {
        const supabase = createSupabaseBrowserClient();
        const state = await invokeEdgeFunction<{
          state: AttemptScreenData["attempt"]["state"];
          state_token: string;
          server_now_utc: string;
          countdown_target_utc: string | null;
          accommodation_policy: StudentAccommodationPolicy;
          invigilation_messages?: StudentInvigilationMessage[];
        }>(supabase, "get-attempt-state", {
          body: { attempt_id: attemptId, attempt_session_id: attemptSessionId },
        });
        if (!state || cancelled) return;
        setInvigilationMessages(state.invigilation_messages ?? []);
        let shouldReloadPackage = false;
        setScreenData((previous) => {
          shouldReloadPackage = previous.attempt.state === "PAUSED" && state.state === "ACTIVE" && !previous.package;
          return {
            ...previous,
            stateToken: state.state_token,
            attempt: {
              ...previous.attempt,
              state: state.state,
              server_now_utc: state.server_now_utc,
              countdown_target_utc: state.countdown_target_utc,
            },
            accommodationPolicy: state.accommodation_policy ?? previous.accommodationPolicy,
          };
        });
        if (shouldReloadPackage) window.location.reload();
      } catch {
        // ReconnectRecoveryBanner remains the visible recovery surface. The last
        // verified server state stays authoritative until the next poll succeeds.
      }
    }

    const interval = window.setInterval(() => void refreshServerState(), 10_000);
    void refreshServerState();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [attemptId, attemptSessionId]);

  const { attempt, package: assessmentPackage, packageError, stateToken, assetUrls, responses, sebConfigUrl, annotations, uploadSlots, accommodationPolicy } = screenData;

  async function acknowledgeInvigilationMessage(messageId: string) {
    const supabase = createSupabaseBrowserClient();
    const response = await invokeEdgeFunction<{ acknowledged_at: string }>(supabase, "acknowledge-invigilation-message", {
      body: { attempt_id: attemptId, message_id: messageId },
    });
    if (!response) throw new Error("The acknowledgement could not be confirmed.");
    setInvigilationMessages((current) => current.map((message) => message.id === messageId
      ? { ...message, acknowledged_at: response.acknowledged_at }
      : message));
  }

  if (attempt.state === "PAUSED") {
    return <AuthenticatedRestBreakPanel attempt={attempt} messages={invigilationMessages} onAcknowledge={acknowledgeInvigilationMessage} onRefresh={() => window.location.reload()} />;
  }

  // Show "Verifying..." if we are fetching the package on the client
  if (isLoadingPackage) {
    const isSeb = initialScreenData.attempt.delivery_mode === "seb_required";
    return (
      <section className="mx-auto grid max-w-[760px] gap-4 rounded-[4px] border border-[var(--border)] bg-white p-6">
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
      <section className="mx-auto grid max-w-[760px] gap-4 rounded-[4px] border border-[var(--border)] bg-white p-6 shadow-[var(--shadow-card)]">
        <AttemptStateBadge state={attempt.state} />
        <div>
          <h1 className="text-xl font-semibold text-[var(--ink)]">
            {attempt.delivery_mode === "seb_required" ? "Safe Exam Browser Required" : "Exam content is not available yet"}
          </h1>
          <div className="mt-4 rounded-[4px] border border-[var(--danger)]/20 bg-[var(--danger-bg)]/20 p-4 text-sm text-[var(--danger)]">
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
                    className="inline-flex h-9 items-center justify-center rounded-[2px] border border-[var(--border)] px-4 text-xs font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-muted)]"
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
    <div
      className="exam-mode min-h-screen bg-[var(--background)] pb-12"
      data-exam-font-scale={accommodationPolicy.font_scale_percent}
      data-exam-readable-font={accommodationPolicy.dyslexia_font}
      data-exam-contrast={accommodationPolicy.contrast_mode}
    >
      <TelemetryListener attemptId={attemptId} attemptSessionId={attemptSessionId} stateToken={stateToken} />
      <header className="sticky top-0 z-50 mb-6 border-b border-slate-700 bg-[var(--sidebar)] px-4 py-3 text-white shadow-[0_1px_0_rgba(0,0,0,0.2)] md:px-6">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AttemptStateBadge state="ACTIVE" />
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white md:text-xl">{assessmentPackage.assessment.title}</h1>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                {assessmentPackage.assessment.paper_code} · {attempt.delivery_mode === "seb_required" ? "Safe Exam Browser Mode" : "Browser Mode (Standard)"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ExamWorkspaceControls mode={layoutMode} onModeChange={setLayoutMode} toolsOpen={toolsOpen} onToolsOpenChange={setToolsOpen} />
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
      <div className="mx-auto max-w-[1540px] px-4">
        <ReconnectRecoveryBanner attemptId={attemptId} />
      </div>
      <div className={`mx-auto grid max-w-[1540px] gap-6 px-4 ${
        layoutMode === "focus"
          ? "lg:grid-cols-[220px_1fr]"
          : layoutMode === "wide"
          ? "lg:grid-cols-[220px_1fr] xl:grid-cols-[220px_minmax(0,1.35fr)_300px]"
          : "lg:grid-cols-[240px_1fr] xl:grid-cols-[240px_1fr_320px]"
      }`}>
        <div className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
          <QuestionNavigator questions={assessmentPackage.questions} responses={responses} annotations={annotations} uploadSlots={uploadSlots} />
        </div>
        <div>
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
        </div>
        <aside className={`content-start gap-4 xl:sticky xl:top-24 xl:self-start ${
          layoutMode === "focus" || !toolsOpen ? "hidden xl:hidden" : "grid"
        }`} aria-label="Response tools">
          <AccommodationSummary policy={accommodationPolicy} />
          <StudentInvigilationMessages messages={invigilationMessages} compact onAcknowledge={acknowledgeInvigilationMessage} />
          <StudentMaterialsDrawer materials={materials} />
          <PinnedMaterialsPanel materials={materials} />
          
          <section className="rounded-[4px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-card)]">
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink)]">Response panel</h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
              Typed answers are saved instantly. PDF uploads will be requested one slot at a time per question.
            </p>
            <SubmitExamButton attemptId={attemptId} stateToken={stateToken} className="mt-4 w-full shadow-sm" />
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-4">
              <ButtonLink href={`/student/attempts/${attemptId}/recovery-status`} variant="secondary" className="justify-center text-xs font-semibold">
                Report Issue
              </ButtonLink>
              <ButtonLink href={`/student/attempts/${attemptId}/finalize`} variant="secondary" className="justify-center text-xs font-semibold">
                Finalize Checklist
              </ButtonLink>
            </div>
            <div className="mt-3">
              <KeyboardShortcutsPanel />
            </div>
          </section>

          <div className="rounded-[4px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-card)] lg:hidden">
            <QuestionNavigator questions={assessmentPackage.questions} responses={responses} annotations={annotations} uploadSlots={uploadSlots} />
          </div>

          <UploadQueueDrawer
            uploadNodes={uploadNodes}
            uploadSlots={uploadSlots}
            attemptId={attemptId}
            stateToken={stateToken}
            onUploadComplete={handleUploadComplete}
          />

          <section className="rounded-[4px] border border-[var(--border)] bg-white p-4 text-center text-xs leading-relaxed text-[var(--muted)] shadow-[var(--shadow-card)]">
            Browser telemetry is recorded as moderation evidence. It is not treated as proof of misconduct by itself.
          </section>
        </aside>
      </div>
    </div>
  );
}

function AuthenticatedRestBreakPanel({
  attempt,
  onRefresh,
  messages,
  onAcknowledge,
}: {
  attempt: AttemptScreenData["attempt"];
  onRefresh: () => void;
  messages: StudentInvigilationMessage[];
  onAcknowledge: (messageId: string) => Promise<void>;
}) {
  return (
    <section className="mx-auto grid min-h-[70vh] max-w-[760px] content-center gap-5 px-4 py-10">
      <div className="rounded-[6px] border border-[#e6c577] bg-[var(--warning-bg)] p-6 shadow-[var(--shadow-card)]">
        <AttemptStateBadge state="PAUSED" />
        <h1 className="mt-4 text-2xl font-semibold text-[var(--ink)]">Approved rest break</h1>
        <p className="mt-2 text-sm leading-6 text-[#5f4510]">
          The server has paused this attempt. Answers, uploads, and submission are locked until the invigilator resumes
          the exam. Your official deadlines will be extended by the approved break duration.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={onRefresh}>Check server state</Button>
          <span className="text-xs text-[var(--muted)]">Attempt {attempt.id.slice(0, 8)}</span>
        </div>
      </div>
      <StudentInvigilationMessages messages={messages} onAcknowledge={onAcknowledge} />
    </section>
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
