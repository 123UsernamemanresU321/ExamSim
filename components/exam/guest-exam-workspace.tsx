"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, CheckCircle2, Clock3, Flag, Loader2, Send } from "lucide-react";
import { CountdownTimer } from "@/components/countdown-timer";
import { MathRenderer } from "@/components/math-renderer";
import { TableResponseInput, WhiteboardResponseInput } from "@/components/response-capability-inputs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { NormalizedAssessmentPackage } from "@/lib/assessment-package";
import { resolveResponseCapability } from "@/lib/examsim/response-capabilities";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokePublicEdgeFunction } from "@/lib/supabase/functions-client";
import { validatePdfUpload } from "@/lib/upload-policy";

type GuestStateResponse = {
  attempt_id: string;
  state: "WAITING" | "ACTIVE" | "UPLOAD_ONLY" | "FINISHED_REVIEW";
  state_token: string;
  countdown_target_utc: string | null;
  server_now_utc: string;
  display_timezone: string;
};

type GuestPackageResponse = {
  assessment_package: NormalizedAssessmentPackage;
  state: string;
  upload_slots?: GuestUploadSlot[];
};

type QuestionNode = NormalizedAssessmentPackage["questions"][number];

type GuestUploadSlot = {
  id: string;
  attempt_id: string;
  question_node_id: string;
  required: boolean;
  status: "pending" | "uploaded" | "blank_placeholder" | "missing" | "rejected";
  locked_at: string | null;
  object_path: string | null;
  original_file_name: string | null;
  file_size_bytes: number | null;
  content_type: string | null;
  is_blank_placeholder: boolean;
};

type GuestUploadUrlResponse = {
  upload_slot_id: string;
  question_node_id: string;
  bucket: "answer-uploads";
  path: string;
  upload_token: string;
  max_file_size_bytes: number;
};

export function GuestExamWorkspace({ mode }: { mode: "lobby" | "live" | "finalize" | "submitted" }) {
  const router = useRouter();
  const [attemptId] = useState<string | null>(() => typeof window === "undefined" ? null : sessionStorage.getItem("examvault_guest_attempt_id"));
  const [guestToken] = useState<string | null>(() => typeof window === "undefined" ? null : sessionStorage.getItem("examvault_guest_token"));
  const [receiptIdentity] = useState(() => typeof window === "undefined" ? {
    code: "",
    studentName: "",
    studentNumber: "",
    submittedAt: "",
  } : {
    code: sessionStorage.getItem("examvault_guest_code") ?? "",
    studentName: sessionStorage.getItem("examvault_guest_student_name") ?? "",
    studentNumber: sessionStorage.getItem("examvault_guest_student_number") ?? "",
    submittedAt: sessionStorage.getItem("examvault_guest_submitted_at") ?? "",
  });
  const [state, setState] = useState<GuestStateResponse | null>(null);
  const [assessmentPackage, setAssessmentPackage] = useState<NormalizedAssessmentPackage | null>(null);
  const [uploadSlots, setUploadSlots] = useState<GuestUploadSlot[]>([]);
  const [uploadStatus, setUploadStatus] = useState<Record<string, string>>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [technicalIssue, setTechnicalIssue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!guestToken || !attemptId) {
      router.replace("/exam");
    }
  }, [attemptId, guestToken, router]);

  useEffect(() => {
    if (!guestToken || !attemptId) return;
    refreshState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestToken, attemptId]);

  useEffect(() => {
    if (!guestToken || !attemptId || mode === "submitted") return;
    const interval = window.setInterval(() => {
      void refreshState();
    }, mode === "lobby" ? 10_000 : 20_000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestToken, attemptId, mode]);

  useEffect(() => {
    if (!guestToken || !attemptId || !state?.state_token || mode === "lobby") return;
    if (state.state === "WAITING") return;
    startTransition(async () => {
      try {
        const response = await invokePublicEdgeFunction<GuestPackageResponse>("guest-get-attempt-package", {
          body: { guest_token: guestToken, attempt_id: attemptId, state_token: state.state_token },
        });
        if (response?.assessment_package) {
          setAssessmentPackage(response.assessment_package);
          setUploadSlots(response.upload_slots ?? []);
          setSelectedKey(response.assessment_package.questions[0]?.node_key ?? null);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Exam content could not be loaded.");
      }
    });
  }, [guestToken, attemptId, state?.state_token, state?.state, mode]);

  const flatQuestions = useMemo(() => flattenQuestions(assessmentPackage?.questions ?? []), [assessmentPackage]);
  const selectedQuestion = flatQuestions.find((question) => question.node_key === selectedKey) ?? flatQuestions[0] ?? null;
  const selectedCapability = selectedQuestion ? resolveResponseCapability(selectedQuestion) : null;
  const selectedUploadSlot = selectedQuestion
    ? uploadSlots.find((slot) => slot.question_node_id === selectedQuestion.node_id) ?? null
    : null;
  const missingRequiredUploads = uploadSlots.filter((slot) => slot.required && !isUploadSlotSatisfied(slot));

  async function refreshState() {
    if (!guestToken || !attemptId) return;
    try {
      const response = await invokePublicEdgeFunction<GuestStateResponse>("guest-get-attempt-state", {
        body: { guest_token: guestToken, attempt_id: attemptId },
      });
      if (response) {
        sessionStorage.setItem("examvault_guest_state_token", response.state_token);
        setState(response);
        if (mode === "lobby" && response.state !== "WAITING") router.replace("/exam/live");
        if (mode === "live" && response.state === "FINISHED_REVIEW") router.replace("/exam/finalize");
      }
    } catch (stateError) {
      setError(stateError instanceof Error ? stateError.message : "Could not verify exam state.");
    }
  }

  function saveAnswer(question: QuestionNode, answerText: string) {
    setAnswers((current) => ({ ...current, [question.node_key]: answerText }));
    if (!guestToken || !attemptId || !state?.state_token) return;
    window.clearTimeout(Number((saveAnswer as unknown as { timer?: number }).timer));
    (saveAnswer as unknown as { timer?: number }).timer = window.setTimeout(async () => {
      try {
        await invokePublicEdgeFunction("guest-save-response", {
          body: {
            guest_token: guestToken,
            attempt_id: attemptId,
            state_token: state.state_token,
            question_node_id: question.node_id,
            question_node_key: question.node_key,
            answer_text: answerText,
          },
        });
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Autosave failed.");
      }
    }, 700);
  }

  function finalize() {
    if (!guestToken || !attemptId) return;
    startTransition(async () => {
      try {
        await invokePublicEdgeFunction("guest-finalize-attempt", {
          body: { guest_token: guestToken, attempt_id: attemptId, state_token: state?.state_token },
        });
        sessionStorage.setItem("examvault_guest_submitted_at", new Date().toISOString());
        router.push("/exam/submitted");
      } catch (finalizeError) {
        setError(finalizeError instanceof Error ? finalizeError.message : "Could not submit this exam.");
      }
    });
  }

  async function uploadGuestPdf(slot: GuestUploadSlot, question: QuestionNode, file: File) {
    if (!guestToken || !attemptId || !state?.state_token) return;
    const policy = validatePdfUpload(file);
    if (!policy.ok) {
      const reason = file.size > 10 * 1024 * 1024 ? `file-too-large: ${policy.error}` : (policy.error ?? "Upload failed.");
      setUploadStatus((current) => ({ ...current, [slot.id]: reason }));
      return;
    }
    setUploadStatus((current) => ({ ...current, [slot.id]: "uploading" }));
    try {
      const signed = await invokePublicEdgeFunction<GuestUploadUrlResponse>("guest-issue-upload-slot-url", {
        body: {
          guest_token: guestToken,
          attempt_id: attemptId,
          state_token: state.state_token,
          question_node_id: slot.question_node_id,
          question_node_key: question.node_key,
        },
      });
      if (!signed) throw new Error("Signed upload URL was not issued.");
      const supabase = createSupabaseBrowserClient();
      const uploadResult = await supabase.storage
        .from(signed.bucket)
        .uploadToSignedUrl(signed.path, signed.upload_token, file, { contentType: "application/pdf" });
      if (uploadResult.error) throw new Error(uploadResult.error.message);
      const confirmed = await invokePublicEdgeFunction<{
        ok: boolean;
        file_size_bytes: number;
        content_type: string;
        page_count: number | null;
        locked_at: string;
      }>("guest-confirm-upload-slot", {
        body: {
          guest_token: guestToken,
          attempt_id: attemptId,
          state_token: state.state_token,
          question_node_id: signed.question_node_id,
          object_path: signed.path,
          file_name: file.name,
        },
      });
      setUploadSlots((current) => current.map((item) => item.id === slot.id ? {
        ...item,
        status: "uploaded",
        locked_at: confirmed?.locked_at ?? new Date().toISOString(),
        object_path: signed.path,
        original_file_name: file.name,
        file_size_bytes: confirmed?.file_size_bytes ?? file.size,
        content_type: confirmed?.content_type ?? "application/pdf",
      } : item));
      setUploadStatus((current) => ({
        ...current,
        [slot.id]: confirmed?.page_count ? `success · ${confirmed.page_count} page PDF uploaded` : "success · PDF uploaded",
      }));
    } catch (uploadError) {
      setUploadStatus((current) => ({
        ...current,
        [slot.id]: uploadError instanceof Error ? uploadError.message : "Upload failed. Retry while the upload window is open.",
      }));
    }
  }

  function sendTechnicalIssue() {
    if (!guestToken || !attemptId || !technicalIssue.trim()) return;
    startTransition(async () => {
      try {
        await invokePublicEdgeFunction("guest-send-invigilation-message", {
          body: {
            guest_token: guestToken,
            attempt_id: attemptId,
            kind: "technical_issue",
            message: technicalIssue,
          },
        });
        setTechnicalIssue("");
      } catch (issueError) {
        setError(issueError instanceof Error ? issueError.message : "Could not report this issue.");
      }
    });
  }

  if (mode === "submitted") {
    return (
      <Card className="mx-auto max-w-2xl text-center">
        <CheckCircle2 className="mx-auto text-[var(--success)]" size={44} aria-hidden="true" />
        <h1 className="mt-5 text-2xl font-semibold text-[var(--ink)]">Submission received</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Your exam has been finalized. Your teacher will mark and release feedback when it is ready.
        </p>
        <dl className="mt-6 grid gap-3 rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-left">
          <ReviewRow label="Exam code" value={receiptIdentity.code || "Recorded by server"} />
          <ReviewRow label="Student number" value={receiptIdentity.studentNumber || "Recorded by server"} />
          <ReviewRow label="Student name" value={receiptIdentity.studentName || "Recorded by server"} />
          <ReviewRow label="Submission time" value={formatReceiptTime(receiptIdentity.submittedAt)} />
          <ReviewRow label="Attempt ID" value={attemptId ?? "Recorded by server"} />
        </dl>
        <div className="mt-5 rounded-[4px] border border-blue-100 bg-blue-50/50 p-4 text-left text-sm leading-6 text-blue-950">
          <p className="font-semibold">Viewing marked results later</p>
          <p className="mt-1">
            Your teacher controls when marked papers, annotated PDFs, and feedback are released. If your teacher asks you to create or link a student account, use the same student number so your history can be matched safely.
          </p>
        </div>
        <Button className="mt-6" type="button" onClick={() => router.push("/exam")}>Return to exam entry</Button>
      </Card>
    );
  }

  if (mode === "lobby") {
    return (
      <Card className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-[4px] bg-[var(--primary)] text-white">
            <Clock3 size={20} aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-[var(--ink)]">Waiting room</h1>
            <p className="text-sm text-[var(--muted)]">Keep this page open. The exam content unlocks only when the server marks the session active.</p>
          </div>
        </div>
        <div className="mt-6 rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Official countdown</p>
          {state ? (
            <CountdownTimer
              serverNowUtc={state.server_now_utc}
              targetUtc={state.countdown_target_utc}
              state={state.state}
              onExpire={() => void refreshState()}
            />
          ) : (
            <p className="mt-2 font-mono text-2xl font-semibold text-[var(--ink)]">Checking...</p>
          )}
          <p className="mt-3 text-sm text-[var(--muted)]">
            The exam opens automatically when the server releases it. You do not need to refresh the page.
          </p>
        </div>
        {error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}
        <div className="mt-6 flex gap-3">
          <Button type="button" onClick={refreshState}>Check again</Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/exam/live")}>Open workspace</Button>
        </div>
      </Card>
    );
  }

  if (mode === "finalize") {
    return (
      <Card className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-[var(--ink)]">Submit review</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Review your answers before finalizing. This does not change the official timer or upload rules.
        </p>
        <dl className="mt-6 grid gap-3">
          <ReviewRow label="Answered typed questions" value={`${Object.values(answers).filter(Boolean).length}`} />
          <ReviewRow label="Flagged questions" value={`${Object.values(flags).filter(Boolean).length}`} />
          <ReviewRow label="Required PDF uploads" value={`${uploadSlots.filter(isUploadSlotSatisfied).length}/${uploadSlots.filter((slot) => slot.required).length}`} />
          <ReviewRow label="Attempt ID" value={attemptId ?? "Loading"} />
        </dl>
        {missingRequiredUploads.length ? (
          <div className="mt-4 rounded-[4px] border border-[var(--warning)] bg-[var(--warning-bg)] p-3 text-sm text-[var(--warning)]">
            Missing required uploads: {missingRequiredUploads.length}. Upload each required PDF before finalizing.
          </div>
        ) : null}
        {error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}
        <div className="mt-6 flex gap-3">
          <Button type="button" variant="secondary" onClick={() => router.push("/exam/live")}>Back to exam</Button>
          <Button type="button" isLoading={isPending} onClick={finalize}>
            <Send size={16} aria-hidden="true" />
            Finalize submission
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid min-h-[calc(100vh-32px)] gap-4 lg:grid-cols-[260px_minmax(0,1fr)_280px]">
      <aside className="rounded-[4px] border border-white/10 bg-[var(--sidebar)] p-4 text-white">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <BookOpen size={16} aria-hidden="true" />
          Questions
        </div>
        <nav className="mt-4 grid gap-1" aria-label="Question navigation">
          {flatQuestions.map((question) => (
            <button
              key={question.node_key}
              type="button"
              onClick={() => setSelectedKey(question.node_key)}
              className={`flex items-center justify-between rounded-[2px] px-3 py-2 text-left text-sm ${
                selectedKey === question.node_key ? "bg-white text-[var(--sidebar)]" : "text-slate-300 hover:bg-white/10"
              }`}
            >
              <span>{question.display_label ?? question.node_key}</span>
              {flags[question.node_key] ? <Flag size={14} aria-hidden="true" /> : null}
            </button>
          ))}
        </nav>
      </aside>

      <main className="rounded-[4px] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)]">
        {!assessmentPackage || isPending ? (
          <div className="grid min-h-[360px] place-items-center text-[var(--muted)]">
            <span className="inline-flex items-center gap-2"><Loader2 className="animate-spin" size={18} /> Loading secure exam workspace...</span>
          </div>
        ) : selectedQuestion ? (
          <article>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
              <div>
                <h1 className="text-xl font-semibold text-[var(--ink)]">{selectedQuestion.display_label ?? selectedQuestion.node_key}</h1>
                <p className="mt-1 text-sm text-[var(--muted)]">{selectedQuestion.marks ?? "?"} marks</p>
              </div>
              <Button type="button" variant="secondary" onClick={() => setFlags((current) => ({ ...current, [selectedQuestion.node_key]: !current[selectedQuestion.node_key] }))}>
                <Flag size={16} aria-hidden="true" />
                {flags[selectedQuestion.node_key] ? "Unflag" : "Flag"}
              </Button>
            </div>
            <MathRenderer className="mt-6" html={selectedQuestion.prompt?.html} latex={selectedQuestion.prompt?.latex} />
            {selectedCapability?.kind === "table" ? (
              <TableResponseInput
                interaction={selectedQuestion.interaction}
                initialValue={answers[selectedQuestion.node_key] ?? ""}
                onSerializedChange={(serialized) => saveAnswer(selectedQuestion, serialized)}
              />
            ) : selectedCapability?.kind === "whiteboard" ? (
              <WhiteboardResponseInput
                initialValue={answers[selectedQuestion.node_key] ?? ""}
                onSerializedChange={(serialized) => saveAnswer(selectedQuestion, serialized)}
              />
            ) : selectedQuestion.response_mode !== "upload_pdf" && selectedQuestion.response_mode !== "none" ? (
              <label className="mt-6 grid gap-2 text-sm font-semibold text-[var(--ink)]">
                Answer
                <textarea
                  value={answers[selectedQuestion.node_key] ?? ""}
                  onChange={(event) => saveAnswer(selectedQuestion, event.target.value)}
                  className="min-h-48 resize-y rounded-[2px] border border-[var(--border)] bg-white p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                />
              </label>
            ) : (
              <div className="mt-6 rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm text-[var(--muted)]">
                {selectedUploadSlot ? (
                  <GuestUploadPanel
                    question={selectedQuestion}
                    slot={selectedUploadSlot}
                    status={uploadStatus[selectedUploadSlot.id]}
                    onUpload={(file) => void uploadGuestPdf(selectedUploadSlot, selectedQuestion, file)}
                  />
                ) : (
                  "This subquestion is part of a root-question PDF upload. Use the upload slot for the main question."
                )}
              </div>
            )}
          </article>
        ) : (
          <p className="text-sm text-[var(--muted)]">No questions are available.</p>
        )}
      </main>

      <aside className="rounded-[4px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-card)]">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Exam state</p>
        <p className="mt-2 font-mono text-lg font-semibold text-[var(--ink)]">{state?.state ?? "CHECKING"}</p>
        {state ? (
          <div className="mt-3 rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
            <CountdownTimer
              serverNowUtc={state.server_now_utc}
              targetUtc={state.countdown_target_utc}
              state={state.state}
              onExpire={() => void refreshState()}
            />
          </div>
        ) : null}
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Autosave runs only while the server state is active. Timing remains server controlled.</p>
        {error?.includes("Guest SEB sessions are blocked") ? (
          <p className="mt-4 rounded-[4px] bg-[var(--warning-bg)] p-3 text-sm text-[var(--warning)]">
            Guest SEB sessions are blocked unless verified secure mode is configured. Ask your teacher for the authenticated secure-mode route.
          </p>
        ) : null}
        {error ? <p className="mt-4 rounded-[4px] bg-[var(--danger-bg)] p-3 text-sm text-[var(--danger)]">{error}</p> : null}
        {uploadSlots.length ? (
          <div className="mt-6 rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Upload queue</p>
            <div className="mt-3 grid gap-2">
              {uploadSlots.map((slot) => (
                <div key={slot.id} className="rounded-[3px] border border-[var(--border)] bg-white p-2 text-xs">
                  <p className="font-semibold text-[var(--ink)]">Slot {slot.id.slice(0, 8)}</p>
                  <p className="mt-1 text-[var(--muted)]">{slot.original_file_name ?? "No file selected"} · {slot.status}</p>
                  {uploadStatus[slot.id] ? <p className="mt-1 text-[var(--muted)]">{uploadStatus[slot.id]}</p> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-6 rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
          <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
            Report technical issue
            <textarea
              value={technicalIssue}
              onChange={(event) => setTechnicalIssue(event.target.value)}
              placeholder="Briefly describe what is not working"
              className="min-h-20 resize-y rounded-[2px] border border-[var(--border)] bg-white p-2 text-sm font-normal outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
            />
          </label>
          <Button className="mt-2 w-full" type="button" variant="secondary" disabled={!technicalIssue.trim()} onClick={sendTechnicalIssue}>
            Send issue report
          </Button>
        </div>
        <Button className="mt-6 w-full" type="button" onClick={() => router.push("/exam/finalize")}>
          Submit review
        </Button>
      </aside>
    </div>
  );
}

function GuestUploadPanel({
  question,
  slot,
  status,
  onUpload,
}: {
  question: QuestionNode;
  slot: GuestUploadSlot;
  status?: string;
  onUpload: (file: File) => void;
}) {
  const satisfied = isUploadSlotSatisfied(slot);
  return (
    <div>
      <p className="font-semibold text-[var(--ink)]">Upload PDF for {question.display_label ?? question.node_key}</p>
      <p className="mt-1 leading-6 text-[var(--muted)]">
        Submit one PDF for this root question. The private file is confirmed server-side before finalization.
      </p>
      <label className="mt-3 block">
        <span className="sr-only">Select PDF for {question.display_label ?? question.node_key}</span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          disabled={satisfied}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) onUpload(file);
            event.currentTarget.value = "";
          }}
          className="block w-full text-sm text-[var(--muted)] file:mr-3 file:rounded-[2px] file:border file:border-[var(--border)] file:bg-white file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[var(--ink)]"
        />
      </label>
      <p className="mt-3 text-sm text-[var(--muted)]">
        {satisfied ? `Uploaded: ${slot.original_file_name ?? "PDF"}` : "Status: pending. You can retry if the upload fails."}
      </p>
      {status ? <p className="mt-2 text-sm text-[var(--muted)]" role="status">{status}</p> : null}
    </div>
  );
}

function isUploadSlotSatisfied(slot: GuestUploadSlot) {
  return (slot.status === "uploaded" && Boolean(slot.object_path) && Boolean(slot.locked_at)) || slot.status === "blank_placeholder";
}

function flattenQuestions(nodes: QuestionNode[]): QuestionNode[] {
  return nodes.flatMap((node) => [node, ...flattenQuestions((node.children ?? []) as QuestionNode[])]);
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] py-2 text-sm">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="font-mono font-semibold text-[var(--ink)]">{value}</dd>
    </div>
  );
}

function formatReceiptTime(value: string) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return "Recorded by server";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
