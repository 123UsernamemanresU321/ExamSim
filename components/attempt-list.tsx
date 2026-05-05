import { Clock, FileCheck, UploadCloud } from "lucide-react";
import { AttemptStateBadge } from "@/components/attempt-state-badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatInTimezone } from "@/lib/attempt-state";
import { attemptWithState, sampleAttempts } from "@/lib/demo-data";

function routeForState(attemptId: string, state: string) {
  if (state === "WAITING") return `/student/attempts/${attemptId}/waiting`;
  if (state === "UPLOAD_ONLY") return `/student/attempts/${attemptId}/upload`;
  if (state === "FINISHED_REVIEW") return `/student/attempts/${attemptId}/finished`;
  return `/student/attempts/${attemptId}/exam`;
}

export function AttemptList() {
  return (
    <div className="grid gap-4">
      {sampleAttempts.map((attempt) => {
        const withState = attemptWithState(attempt.id);
        return (
          <Card key={attempt.id} className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <AttemptStateBadge state={withState.state} />
                <span className="text-xs font-semibold text-[var(--muted)]">{attempt.paper_code}</span>
              </div>
              <h2 className="text-lg font-semibold text-[var(--ink)]">{attempt.title}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Starts {formatInTimezone(attempt.start_at_utc, attempt.display_timezone)} · {attempt.duration_seconds / 60} min
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {withState.state === "UPLOAD_ONLY" ? <UploadCloud size={18} aria-hidden="true" /> : null}
              {withState.state === "FINISHED_REVIEW" ? <FileCheck size={18} aria-hidden="true" /> : null}
              {withState.state === "WAITING" ? <Clock size={18} aria-hidden="true" /> : null}
              <ButtonLink href={routeForState(attempt.id, withState.state)}>Open</ButtonLink>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
