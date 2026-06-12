import { Badge } from "@/components/ui/badge";
import type { AttemptState } from "@/lib/constants";

type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

export function StatusBadge({
  status,
  tone,
}: {
  status: string | null | undefined;
  tone?: BadgeTone;
}) {
  const label = status ? status.replaceAll("_", " ") : "not set";
  return <Badge tone={tone ?? statusTone(status)}>{label}</Badge>;
}

export function ParseBadge({ confidence }: { confidence: number | null | undefined }) {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return <Badge tone="neutral">parse not checked</Badge>;
  const percent = Math.round(confidence * 100);
  const tone = confidence < 0.65 ? "danger" : confidence < 0.85 ? "warning" : "success";
  return <Badge tone={tone}>parse {percent}%</Badge>;
}

export function ExamStateBadge({ state }: { state: AttemptState | string }) {
  return <Badge tone={attemptStateTone(String(state))}>{String(state).replaceAll("_", " ")}</Badge>;
}

export function AssessmentStatusBadge({ status }: { status: string | null | undefined }) {
  return <Badge tone={assessmentTone(status)}>{status ? status.replaceAll("_", " ") : "no version"}</Badge>;
}

function statusTone(status: string | null | undefined): BadgeTone {
  if (!status) return "neutral";
  const value = status.toLowerCase();
  if (["published", "complete", "completed", "released", "mapped", "uploaded", "active", "passed"].some((item) => value.includes(item))) return "success";
  if (["review", "queued", "pending", "partial", "warning", "upload"].some((item) => value.includes(item))) return "warning";
  if (["failed", "danger", "rejected", "missing", "high", "error"].some((item) => value.includes(item))) return "danger";
  if (["draft", "waiting", "new"].some((item) => value.includes(item))) return "info";
  return "neutral";
}

function attemptStateTone(state: string): BadgeTone {
  if (state === "ACTIVE") return "success";
  if (state === "UPLOAD_ONLY") return "warning";
  if (state === "FINISHED_REVIEW") return "neutral";
  if (state === "WAITING") return "info";
  return "accent";
}

function assessmentTone(status: string | null | undefined): BadgeTone {
  if (status === "published") return "success";
  if (status === "review_required") return "warning";
  if (status === "failed") return "danger";
  if (status === "draft") return "info";
  return "neutral";
}
