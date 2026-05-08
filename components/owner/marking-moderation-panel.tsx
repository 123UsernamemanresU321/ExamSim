"use client";

import { AlertTriangle, Clock, Eye, Maximize, MousePointer, Activity, Info, FileWarning, CheckCircle2 } from "lucide-react";
import type { ModerationReport, AttemptEvent } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function MarkingModerationPanel({
  report,
  events,
}: {
  report: ModerationReport | null;
  events: AttemptEvent[];
}) {
  const summary = report?.summary_json as any || {};

  const signals = [
    { label: "Fullscreen Exits", count: summary.fullscreenExitCount ?? 0, icon: Maximize, color: "text-red-500", bg: "bg-red-50" },
    { label: "Visibility Losses", count: summary.visibilityHiddenCount ?? 0, icon: Eye, color: "text-orange-500", bg: "bg-orange-50" },
    { label: "Window Blurs", count: summary.windowBlurCount ?? 0, icon: MousePointer, color: "text-amber-500", bg: "bg-amber-50" },
    { label: "Network Gaps", count: summary.reconnectCount ?? 0, icon: Activity, color: "text-blue-500", bg: "bg-blue-50" },
  ];

  return (
    <div className="space-y-10">
      {/* Moderation Summary */}
      <section>
        <div className="flex items-center gap-2 mb-6">
          <AlertTriangle size={20} className="text-orange-500" />
          <h3 className="text-lg font-bold">Moderation Signals</h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {signals.map((s) => (
            <div key={s.label} className={cn("rounded-lg border border-[var(--border)] p-4 shadow-sm", s.bg)}>
              <div className="flex items-center justify-between mb-2">
                <s.icon size={16} className={s.color} />
                <Badge tone="neutral" className="bg-white border-[var(--border)]">{s.count}</Badge>
              </div>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--subtle)]">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-lg border border-orange-100 bg-orange-50/50 p-4 flex gap-3 text-orange-800">
          <Info size={18} className="flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">Important Note on Moderation</p>
            <p className="mt-1 opacity-90">
              These signals are technical markers of browser behavior. They represent potential interruptions to the
              secure exam environment but are not definitive proof of academic misconduct. Please review the timeline
              contextually alongside the student&apos;s responses.
            </p>
          </div>
        </div>
      </section>

      {/* Chronological Timeline */}
      <section>
        <div className="flex items-center gap-2 mb-6">
          <Clock size={20} className="text-blue-500" />
          <h3 className="text-lg font-bold">Attempt Timeline</h3>
        </div>

        <div className="space-y-4 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-[var(--border)]">
          {events.length === 0 ? (
            <p className="pl-8 text-sm italic text-[var(--muted)]">No telemetry events recorded for this attempt.</p>
          ) : (
            events.map((event, idx) => {
              const config = getEventConfig(event.event_type);
              return (
                <div key={event.id || idx} className="relative pl-8 flex flex-col gap-1">
                  <div className={cn(
                    "absolute left-0 top-1.5 h-6 w-6 rounded-full border-2 border-white flex items-center justify-center shadow-sm",
                    config.bg
                  )}>
                    <config.icon size={12} className={config.color} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                      {config.label}
                    </span>
                    <span className="text-[10px] tabular-nums text-[var(--muted)]">
                      {new Date(event.server_received_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--muted)] leading-relaxed">
                    {formatPayload(event.event_type, event.payload_json as any)}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

function getEventConfig(type: string) {
  const configs: Record<string, { label: string; icon: any; color: string; bg: string }> = {
    "fullscreen.exit": { label: "Security: Fullscreen Exit", icon: Maximize, color: "text-red-600", bg: "bg-red-100" },
    "visibility.hidden": { label: "Security: Tab Switched", icon: Eye, color: "text-orange-600", bg: "bg-orange-100" },
    "visibility.visible": { label: "Security: Tab Returned", icon: CheckCircle2, color: "text-green-600", bg: "bg-green-100" },
    "window.blur": { label: "Security: Focus Lost", icon: MousePointer, color: "text-amber-600", bg: "bg-amber-100" },
    "heartbeat": { label: "Presence: Heartbeat", icon: Activity, color: "text-blue-400", bg: "bg-blue-50" },
    "reconnect": { label: "Network: Restored", icon: Activity, color: "text-blue-600", bg: "bg-blue-100" },
    "upload.success": { label: "Submission: File Uploaded", icon: CheckCircle2, color: "text-green-600", bg: "bg-green-100" },
    "upload.failed": { label: "Submission: Upload Error", icon: FileWarning, color: "text-red-600", bg: "bg-red-100" },
  };

  return configs[type] || { label: type, icon: Info, color: "text-slate-600", bg: "bg-slate-100" };
}

function formatPayload(type: string, payload: any): string {
  if (type === "fullscreen.exit") return "The student exited the mandatory fullscreen mode.";
  if (type === "visibility.hidden") return "The exam window was hidden or the student switched tabs.";
  if (type === "visibility.visible") return "The student returned to the exam window.";
  if (type === "window.blur") return "The browser window lost focus (student may be using another app).";
  if (type === "upload.success") return `Successfully uploaded file for node: ${payload.question_node_id || 'unknown'}`;
  
  return JSON.stringify(payload) !== "{}" ? JSON.stringify(payload) : "Standard telemetry signal recorded.";
}
