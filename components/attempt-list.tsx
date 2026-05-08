import { Clock, FileCheck, UploadCloud } from "lucide-react";
import { AttemptStateBadge } from "@/components/attempt-state-badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatInTimezone } from "@/lib/attempt-state";
import type { AttemptSummary } from "@/lib/live-data";

function routeForState(attemptId: string, state: string) {
  if (state === "WAITING") return `/student/attempts/${attemptId}/waiting`;
  if (state === "UPLOAD_ONLY") return `/student/attempts/${attemptId}/upload`;
  if (state === "FINISHED_REVIEW") return `/student/attempts/${attemptId}/finished`;
  return `/student/attempts/${attemptId}/exam`;
}

export function AttemptList({ attempts }: { attempts: AttemptSummary[] }) {
  return (
    <div className="grid gap-4">
      {attempts.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--muted)]">No assigned attempts yet.</p>
        </Card>
      ) : (
        attempts.map((attempt) => (
          <Card key={attempt.id} className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <AttemptStateBadge state={attempt.state} />
                <span className="text-xs font-semibold text-[var(--muted)]">{attempt.paper_code}</span>
              </div>
              <h2 className="text-lg font-semibold text-[var(--ink)]">{attempt.title}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Starts {formatInTimezone(attempt.start_at_utc, attempt.display_timezone)} · {attempt.duration_seconds / 60} min
              </p>
              {attempt.seb_config_url && (
                <a 
                  href={attempt.seb_config_url}
                  className="mt-2 inline-block text-xs font-medium text-[var(--ink)] underline hover:text-[var(--ink-hover)]"
                >
                  Download SEB Config (.seb)
                </a>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {attempt.state === "UPLOAD_ONLY" ? <UploadCloud size={18} aria-hidden="true" /> : null}
              {attempt.state === "FINISHED_REVIEW" ? <FileCheck size={18} aria-hidden="true" /> : null}
              {attempt.state === "WAITING" ? <Clock size={18} aria-hidden="true" /> : null}
              <ButtonLink href={routeForState(attempt.id, attempt.state)}>Open</ButtonLink>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
