export const DEFAULT_TIMEZONE = "Africa/Johannesburg" as const;

export const APP_ROLES = ["owner", "student"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const ASSESSMENT_KINDS = ["practice_paper", "quiz", "test", "exam"] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

export const SOURCE_KINDS = ["pdf", "latex", "json"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const AUTHORING_ORIGINS = ["owner_uploaded", "owner_pasted", "imported", "ai_generated"] as const;
export type AuthoringOrigin = (typeof AUTHORING_ORIGINS)[number];

export const DELIVERY_MODES = ["browser", "seb_required"] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export const ATTEMPT_STATES = [
  "WAITING",
  "ACTIVE",
  "PAUSED",
  "UPLOAD_ONLY",
  "FINISHED_REVIEW",
] as const;
export type AttemptState = (typeof ATTEMPT_STATES)[number];

export const QUESTION_NODE_TYPES = ["section", "question", "subquestion", "part"] as const;
export type QuestionNodeType = (typeof QUESTION_NODE_TYPES)[number];

export const RESPONSE_MODES = [
  "none",
  "typed_text",
  "upload_pdf",
  "typed_or_upload",
  "multiple_choice",
  "numerical",
] as const;
export type ResponseMode = (typeof RESPONSE_MODES)[number];

export const MODERATION_EVENT_TYPES = [
  "fullscreen.enter",
  "fullscreen.exit",
  "visibility.visible",
  "visibility.hidden",
  "window.focus",
  "window.blur",
  "page.pagehide",
  "network.online",
  "network.offline",
  "heartbeat",
  "reconnect",
  "upload.url_requested",
  "upload.completed",
  "text.autosaved",
  "attempt.finalized",
  "suspicious.reload_attempt",
] as const;

export type ModerationEventType = (typeof MODERATION_EVENT_TYPES)[number] | string;

export const MODERATION_SEVERITIES = ["none", "low", "medium", "high"] as const;
export type ModerationSeverity = (typeof MODERATION_SEVERITIES)[number];
