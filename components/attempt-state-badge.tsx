import { Badge } from "@/components/ui/badge";
import type { AttemptState } from "@/lib/constants";

export function AttemptStateBadge({ state }: { state: AttemptState }) {
  const tone =
    state === "ACTIVE"
      ? "success"
      : state === "PAUSED"
        ? "warning"
      : state === "UPLOAD_ONLY"
        ? "warning"
        : state === "FINISHED_REVIEW"
          ? "neutral"
          : "accent";

  return <Badge tone={tone}>{state.replace("_", " ")}</Badge>;
}
