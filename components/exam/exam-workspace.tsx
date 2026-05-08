"use client";

import { useEffect, useState } from "react";
import { AttemptStateBadge } from "@/components/attempt-state-badge";
import { CountdownTimer } from "@/components/countdown-timer";
import { QuestionNavigator } from "@/components/question-navigator";
import { QuestionPaper } from "@/components/question-paper";
import { TelemetryListener } from "@/components/telemetry-listener";
import { UploadSlotCard } from "@/components/upload-slot-card";
import { SubmitExamButton } from "@/components/submit-exam-button";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { flattenQuestionNodes, normalizedPackageSchema, type NormalizedAssessmentPackage } from "@/lib/assessment-package";
import type { AttemptScreenData } from "@/lib/attempt-screen-data";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";

function LastSavedBadge({ responses }: { responses: { saved_at: string }[] }) {
  if (responses.length === 0) return <Badge tone="neutral">Not saved yet</Badge>;
  const latest = [...responses].sort((a, b) => Date.parse(b.saved_at) - Date.parse(a.saved_at))[0];
  const time = new Date(latest.saved_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  return <Badge tone="success">Last saved {time} UTC</Badge>;
}

export function ExamWorkspace({ 
  attemptId, 
  initialScreenData 
}: { 
  attemptId: string; 
  initialScreenData: AttemptScreenData;
}) {
  const [screenData, setScreenData] = useState<AttemptScreenData>(initialScreenData);
  const [isLoadingPackage, setIsLoadingPackage] = useState(!initialScreenData.package);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  useEffect(() => {
    // If the package is already there (e.g. standard browser SSR), we are good.
    if (screenData.package) return;

    async function loadPackage() {
      setIsLoadingPackage(true);
      setLoadError(null);
      
      // Attempt to extract SEB keys from the environment (JS API or User-Agent)
      let detectedBek: string | null = null;
      let detectedCk: string | null = null;
      
      const sebApi = (window as any).SafeExamBrowser?.security;
      if (sebApi) {
        detectedBek = sebApi.browserExamKey || null;
        detectedCk = sebApi.configKey || null;
      }

      // Fallback: Check User-Agent (SEB can be configured to append hashes here)
      if (!detectedBek || !detectedCk) {
        const ua = navigator.userAgent;
        const bekMatch = ua.match(/BEK=([a-f0-9]{64})/i);
        const ckMatch = ua.match(/CK=([a-f0-9]{64})/i);
        if (bekMatch) detectedBek = bekMatch[1];
        if (ckMatch) detectedCk = ckMatch[1];
      }

      setDebugInfo({
        hasSebApi: !!sebApi,
        userAgent: navigator.userAgent,
        detectedBek: detectedBek ? `${detectedBek.substring(0, 8)}...` : "None",
        detectedCk: detectedCk ? `${detectedCk.substring(0, 8)}...` : "None",
      });

      try {
        const supabase = createSupabaseBrowserClient();
        const response = await invokeEdgeFunction<{ assessment_package: unknown }>(supabase, "get-attempt-package", {
          body: { 
            attempt_id: attemptId, 
            state_token: initialScreenData.stateToken,
            // Pass the keys in the body to bypass header-stripping in cross-domain requests
            seb_browser_exam_key_hash: detectedBek,
            seb_config_key_hash: detectedCk,
          },
        });

        if (!response?.assessment_package) {
          throw new Error("The server did not return an exam package.");
        }

        const parsed = normalizedPackageSchema.safeParse(response.assessment_package);
        if (!parsed.success) {
          throw new Error("Released package failed schema validation.");
        }

        setScreenData(prev => ({
          ...prev,
          package: parsed.data,
          packageError: null
        }));
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Verification failed.");
      } finally {
        setIsLoadingPackage(false);
      }
    }

    loadPackage();
  }, [attemptId, initialScreenData.stateToken, screenData.package]);

  const { attempt, package: assessmentPackage, packageError, stateToken, responses, sebConfigUrl, annotations } = screenData;

  // Show "Verifying..." if we are fetching the package on the client
  if (isLoadingPackage) {
    return (
      <section className="mx-auto grid max-w-[760px] gap-4 rounded-lg border border-[var(--border)] bg-white p-6">
        <AttemptStateBadge state={attempt.state} />
        <h1 className="text-xl font-semibold text-[var(--ink)]">Verifying Exam Environment...</h1>
        <p className="text-sm leading-6 text-[var(--muted)] italic">
          Checking Safe Exam Browser security keys and unlocking assessment content. Please wait.
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
          {debugInfo && (loadError || packageError) && (
            <div className="mt-4 rounded-md bg-gray-50 p-3 text-[10px] font-mono text-gray-500 border border-gray-200">
              <p className="font-bold mb-1 uppercase tracking-wider text-[9px]">Environment Debug Info:</p>
              <p>SEB JS API: {debugInfo.hasSebApi ? "Available" : "Missing"}</p>
              <p>Detected BEK: {debugInfo.detectedBek}</p>
              <p>Detected CK: {debugInfo.detectedCk}</p>
              <p className="mt-1 opacity-60 break-all">UA: {debugInfo.userAgent}</p>
            </div>
          )}

          {attempt.delivery_mode === "seb_required" && (
            <div className="mt-4 space-y-4">
              <p className="text-sm leading-6 text-[var(--muted)]">
                This exam is locked to a specific Safe Exam Browser configuration. Please ensure you are opening this page 
                inside the Safe Exam Browser application with the correct configuration file provided by your institution.
              </p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => {
                    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                    const returnUrl = window.location.href;
                    window.location.href = `${supabaseUrl}/functions/v1/seb-handshake?attempt_id=${attemptId}&state_token=${encodeURIComponent(stateToken)}&return_url=${encodeURIComponent(returnUrl)}`;
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--ink)] px-4 text-sm font-medium text-white hover:bg-[var(--ink-hover)] transition-colors"
                >
                  Verify Environment Securely
                </button>
                <p className="text-xs text-[var(--subtle)]">
                  If you are already inside SEB, use the button above to perform a secure environment handshake.
                </p>
              </div>
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

  const uploadNodes = flattenQuestionNodes(assessmentPackage.questions).filter((node) =>
    node.response_mode.includes("upload"),
  );

  return (
    <div className="exam-mode">
      <TelemetryListener attemptId={attemptId} stateToken={stateToken} />
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
          responses={responses}
          annotations={annotations}
        />
        <aside className="grid content-start gap-4 xl:sticky xl:top-28 xl:self-start" aria-label="Response tools">
          <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-[var(--ink)]">Response panel</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Typed answers autosave during ACTIVE. Upload URLs are issued one slot at a time.
            </p>
            <SubmitExamButton attemptId={attemptId} stateToken={stateToken} className="mt-4" />
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
