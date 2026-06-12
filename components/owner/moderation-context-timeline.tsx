import { Activity, AlertTriangle, Clock, FileUp, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ModerationTimelineItem } from "@/lib/moderation-timeline";

const phaseLabels: Record<string, string> = {
  before_start: "Before start",
  active_writing: "Active writing",
  upload_only: "Upload-only",
  finished: "Finished",
};

export function ModerationContextTimeline({ groups }: { groups: Array<{ phase: string; events: ModerationTimelineItem[] }> }) {
  if (groups.every((group) => group.events.length === 0)) {
    return (
      <Card className="shadow-none">
        <p className="text-sm italic text-[var(--muted)]">No contextual moderation events are recorded for this attempt.</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-5">
      {groups.filter((group) => group.events.length > 0).map((group) => (
        <section key={group.phase} className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-[var(--ink)]">
            {phaseLabels[group.phase] ?? group.phase}
          </h3>
          <ol className="relative grid gap-4 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-[var(--border)]">
            {group.events.map((event) => {
              const Icon = event.eventType.includes("upload") ? FileUp : event.eventType.includes("offline") ? WifiOff : event.severity === "high" ? AlertTriangle : Activity;
              return (
                <li key={event.id} className="relative pl-9">
                  <span className={cn(
                    "absolute left-0 top-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white shadow-sm",
                    event.severity === "high" ? "bg-red-100 text-red-700" : event.severity === "medium" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600",
                  )}>
                    <Icon size={12} />
                  </span>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-widest text-[var(--ink)]">{event.eventType.replaceAll(".", " ")}</p>
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--muted)]">
                      <Clock size={11} />
                      {new Date(event.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Badge tone={event.severity === "high" ? "danger" : event.severity === "medium" ? "warning" : "neutral"}>
                      {event.severity}
                    </Badge>
                    {event.state ? <Badge tone="neutral">{event.state}</Badge> : null}
                    {event.durationSeconds ? <Badge tone="neutral">{event.durationSeconds}s</Badge> : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{event.explanation}</p>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
