import type { ModerationSeverity } from "@/lib/constants";

export type AttemptEventRecord = {
  event_type: string;
  client_event_at?: string | null;
  server_received_at: string;
  payload_json?: Record<string, unknown> | null;
};

export type UploadSlotRecord = {
  status: "pending" | "uploaded" | "blank_placeholder" | "missing" | "rejected";
  uploaded_at?: string | null;
  required?: boolean;
};

export type ModerationSummary = {
  fullscreenExitCount: number;
  visibilityHiddenCount: number;
  estimatedHiddenSeconds: number;
  windowBlurCount: number;
  reconnectCount: number;
  heartbeatGaps: number;
  missingUploadSlots: number;
  blankPlaceholderCount: number;
  lateUploadAttempts: number;
  uploadTimingSummary: string;
  unusualDeviceChanges: number;
  timeline: { event_type: string; at: string; payload_json: Record<string, unknown> }[];
  severity: ModerationSeverity;
  language: string;
};

function secondsBetween(startIso: string, endIso: string): number {
  return Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 1000));
}

function severityFor(score: number): ModerationSeverity {
  if (score >= 8) return "high";
  if (score >= 3) return "medium";
  if (score >= 1) return "low";
  return "none";
}

export function summarizeModerationEvents(
  events: AttemptEventRecord[],
  slots: UploadSlotRecord[],
): ModerationSummary {
  const ordered = [...events].sort(
    (a, b) => Date.parse(a.server_received_at) - Date.parse(b.server_received_at),
  );

  let hiddenStartedAt: string | null = null;
  let estimatedHiddenSeconds = 0;
  let heartbeatGaps = 0;
  let previousHeartbeat: string | null = null;

  for (const event of ordered) {
    if (event.event_type === "visibility.hidden") {
      hiddenStartedAt = event.server_received_at;
    }
    if (event.event_type === "visibility.visible" && hiddenStartedAt) {
      estimatedHiddenSeconds += secondsBetween(hiddenStartedAt, event.server_received_at);
      hiddenStartedAt = null;
    }
    if (event.event_type === "heartbeat") {
      if (previousHeartbeat && secondsBetween(previousHeartbeat, event.server_received_at) > 45) {
        heartbeatGaps += 1;
      }
      previousHeartbeat = event.server_received_at;
    }
  }

  const fullscreenExitCount = ordered.filter((event) => event.event_type === "fullscreen.exit").length;
  const visibilityHiddenCount = ordered.filter(
    (event) => event.event_type === "visibility.hidden",
  ).length;
  const windowBlurCount = ordered.filter((event) => event.event_type === "window.blur").length;
  const reconnectCount = ordered.filter(
    (event) => event.event_type === "reconnect" || event.event_type === "network.online",
  ).length;
  const lateUploadAttempts = ordered.filter((event) => event.event_type === "upload.late_denied").length;
  const missingUploadSlots = slots.filter((slot) => slot.status === "missing").length;
  const blankPlaceholderCount = slots.filter((slot) => slot.status === "blank_placeholder").length;
  const unusualDeviceChanges = ordered.filter((event) => event.event_type === "device.changed").length;

  const score =
    fullscreenExitCount * 2 +
    visibilityHiddenCount +
    Math.floor(estimatedHiddenSeconds / 60) +
    windowBlurCount +
    reconnectCount +
    heartbeatGaps * 2 +
    lateUploadAttempts * 2 +
    unusualDeviceChanges * 3;
  const severity = severityFor(score);

  return {
    fullscreenExitCount,
    visibilityHiddenCount,
    estimatedHiddenSeconds,
    windowBlurCount,
    reconnectCount,
    heartbeatGaps,
    missingUploadSlots,
    blankPlaceholderCount,
    lateUploadAttempts,
    uploadTimingSummary:
      slots.length === 0
        ? "No upload slots configured."
        : `${slots.filter((slot) => slot.status === "uploaded").length}/${slots.length} slots uploaded.`,
    unusualDeviceChanges,
    timeline: ordered.map((event) => ({
      event_type: event.event_type,
      at: event.server_received_at,
      payload_json: event.payload_json ?? {},
    })),
    severity,
    language:
      severity === "none"
        ? "No major signals detected."
        : "Moderation signal recorded. Requires review; this does not prove misconduct.",
  };
}
