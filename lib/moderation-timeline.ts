import { computeAttemptState } from "@/lib/attempt-state";
import type { Attempt, AttemptEvent, AttemptIncident, AttemptAccommodation } from "@/types/database";

export type TimelinePhase = "before_start" | "active_writing" | "upload_only" | "finished";
export type TimelineSeverity = "none" | "low" | "medium" | "high";

export type ModerationTimelineItem = {
  id: string;
  timestamp: string;
  phase: TimelinePhase;
  state: string;
  eventType: string;
  severity: TimelineSeverity;
  durationSeconds?: number;
  explanation: string;
};

export type ModerationTimelineGroup = {
  phase: TimelinePhase;
  events: ModerationTimelineItem[];
};

export function buildModerationTimeline(input: {
  attempt: Pick<Attempt, "start_at_utc" | "end_at_utc" | "upload_deadline_at_utc" | "solutions_requested">;
  events: Pick<AttemptEvent, "id" | "event_type" | "server_received_at" | "payload_json">[];
  incidents?: Pick<AttemptIncident, "id" | "incident_type" | "description" | "severity" | "created_at">[];
  accommodations?: Pick<AttemptAccommodation, "id" | "accommodation_type" | "reason" | "applied_at">[];
}): ModerationTimelineItem[] {
  const eventItems = input.events.map((event) => {
    const state = computeAttemptState({
      serverNowUtc: event.server_received_at,
      startAtUtc: input.attempt.start_at_utc,
      endAtUtc: input.attempt.end_at_utc,
      uploadDeadlineAtUtc: input.attempt.upload_deadline_at_utc,
      solutionsRequested: input.attempt.solutions_requested,
    });
    return {
      id: event.id,
      timestamp: event.server_received_at,
      phase: phaseForTimestamp(event.server_received_at, input.attempt),
      state,
      eventType: event.event_type,
      severity: severityForEvent(event.event_type),
      durationSeconds: durationFromPayload(event.payload_json),
      explanation: explanationForEvent(event.event_type),
    };
  });

  const incidentItems = (input.incidents ?? []).map((incident) => ({
    id: incident.id,
    timestamp: incident.created_at,
    phase: phaseForTimestamp(incident.created_at, input.attempt),
    state: computeAttemptState({
      serverNowUtc: incident.created_at,
      startAtUtc: input.attempt.start_at_utc,
      endAtUtc: input.attempt.end_at_utc,
      uploadDeadlineAtUtc: input.attempt.upload_deadline_at_utc,
      solutionsRequested: input.attempt.solutions_requested,
    }),
    eventType: `incident.${incident.incident_type}`,
    severity: incident.severity,
    explanation: incident.description,
  }));

  const accommodationItems = (input.accommodations ?? []).map((accommodation) => ({
    id: accommodation.id,
    timestamp: accommodation.applied_at,
    phase: phaseForTimestamp(accommodation.applied_at, input.attempt),
    state: computeAttemptState({
      serverNowUtc: accommodation.applied_at,
      startAtUtc: input.attempt.start_at_utc,
      endAtUtc: input.attempt.end_at_utc,
      uploadDeadlineAtUtc: input.attempt.upload_deadline_at_utc,
      solutionsRequested: input.attempt.solutions_requested,
    }),
    eventType: `accommodation.${accommodation.accommodation_type}`,
    severity: "low" as const,
    explanation: accommodation.reason,
  }));

  return [...eventItems, ...incidentItems, ...accommodationItems].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function groupModerationTimeline(items: ModerationTimelineItem[]): ModerationTimelineGroup[] {
  const phases: TimelinePhase[] = ["before_start", "active_writing", "upload_only", "finished"];
  return phases.map((phase) => ({
    phase,
    events: items.filter((item) => item.phase === phase),
  }));
}

export function phaseForTimestamp(
  timestamp: string,
  attempt: Pick<Attempt, "start_at_utc" | "end_at_utc" | "upload_deadline_at_utc" | "solutions_requested">,
): TimelinePhase {
  const time = Date.parse(timestamp);
  if (time < Date.parse(attempt.start_at_utc)) return "before_start";
  if (time < Date.parse(attempt.end_at_utc)) return "active_writing";
  if (attempt.solutions_requested && attempt.upload_deadline_at_utc && time < Date.parse(attempt.upload_deadline_at_utc)) return "upload_only";
  return "finished";
}

export function severityForEvent(eventType: string): TimelineSeverity {
  if (/fullscreen\.exit|visibility\.hidden|window\.blur|heartbeat_gap|offline|suspicious/i.test(eventType)) return "medium";
  if (/upload\.completed|upload\.url_requested|reconnect|pagehide/i.test(eventType)) return "low";
  return "none";
}

function durationFromPayload(payload: unknown) {
  if (payload && typeof payload === "object" && "duration_seconds" in payload) {
    const value = Number((payload as { duration_seconds?: unknown }).duration_seconds);
    return Number.isFinite(value) ? value : undefined;
  }
  return undefined;
}

function explanationForEvent(eventType: string) {
  if (eventType === "fullscreen.exit") return "Moderation signal: fullscreen was exited.";
  if (eventType === "visibility.hidden") return "Possible interruption: the exam tab was hidden.";
  if (eventType === "window.blur") return "Possible interruption: the exam window lost focus.";
  if (eventType === "network.offline") return "Connectivity interruption was reported.";
  if (eventType === "upload.completed") return "A PDF upload was confirmed.";
  if (eventType === "heartbeat") return "Exam session heartbeat.";
  return eventType.replaceAll(".", " ");
}
