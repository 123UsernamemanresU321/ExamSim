import type { AppRole, AssessmentKind, AttemptState, DeliveryMode } from "@/lib/constants";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Profile = {
  id: string;
  auth_user_id: string;
  app_role: AppRole;
  display_name: string;
  owner_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Attempt = {
  id: string;
  assessment_id: string;
  assessment_version_id: string;
  assignee_profile_id: string;
  start_at_utc: string;
  duration_seconds: number;
  end_at_utc: string;
  upload_deadline_at_utc: string | null;
  display_timezone: string;
  delivery_mode: DeliveryMode;
  solutions_requested: boolean;
  typed_enabled: boolean;
  per_question_upload_enabled: boolean;
  require_blank_for_skipped: boolean;
  state_cache: AttemptState | null;
  created_at: string;
  updated_at: string;
};

export type OwnerSettings = {
  id: string;
  owner_profile_id: string;
  owner_email: string;
  default_timezone: string;
  created_at: string;
  updated_at: string;
};

export type OwnerStudentLink = {
  id: string;
  owner_profile_id: string;
  student_profile_id: string;
  link_type: "owner_persona" | "managed_student";
  created_at: string;
};

export type StudentCredential = {
  id: string;
  student_profile_id: string;
  login_code: string;
  activation_code_hash: string;
  activated_at: string | null;
  created_at: string;
};

export type Assessment = {
  id: string;
  owner_profile_id: string;
  title: string;
  paper_code: string | null;
  external_schedule_ref: string | null;
  assessment_kind: AssessmentKind;
  description: string | null;
  default_timezone: string;
  created_at: string;
  updated_at: string;
};

export type AssessmentVersion = {
  id: string;
  assessment_id: string;
  version_no: number;
  status: "draft" | "review_required" | "published" | "archived";
  source_kind: "pdf" | "latex" | "json";
  source_object_path: string | null;
  normalized_package_path: string | null;
  normalized_package_json: Json | null;
  parse_confidence: number | null;
  requires_owner_review: boolean;
  published_at: string | null;
  created_at: string;
};

export type QuestionNodeRow = {
  id: string;
  assessment_version_id: string;
  parent_node_id: string | null;
  node_key: string;
  ordinal: number;
  node_type: "section" | "question" | "subquestion" | "part";
  title: string | null;
  prompt_html: string | null;
  prompt_latex: string | null;
  marks: number | null;
  response_mode: "none" | "typed_text" | "upload_pdf" | "typed_or_upload" | "multiple_choice";
  interaction_json: Json | null;
  source_page_start: number | null;
  source_page_end: number | null;
  created_at: string;
};

export type AttemptSession = {
  id: string;
  attempt_id: string;
  started_at: string;
  last_heartbeat_at: string | null;
  ended_at: string | null;
  device_id_hash: string | null;
  user_agent_hash: string | null;
  ip_hash: string | null;
  seb_verified: boolean;
  browser_exam_key_hash: string | null;
  config_key_hash: string | null;
  created_at: string;
};

export type AttemptEvent = {
  id: string;
  attempt_id: string;
  attempt_session_id: string | null;
  event_type: string;
  client_event_at: string | null;
  server_received_at: string;
  client_seq: number | null;
  payload_json: Json;
  state_token_id: string | null;
  created_at: string;
};

export type TextResponse = {
  id: string;
  attempt_id: string;
  question_node_id: string;
  answer_text: string;
  saved_at: string;
  finalized_at: string | null;
};

export type UploadSlot = {
  id: string;
  attempt_id: string;
  question_node_id: string;
  required: boolean;
  object_path: string | null;
  uploaded_at: string | null;
  is_blank_placeholder: boolean;
  status: "pending" | "uploaded" | "blank_placeholder" | "missing" | "rejected";
  created_at: string;
  updated_at: string;
};

export type ModerationReport = {
  id: string;
  attempt_id: string;
  summary_json: Json;
  generated_at: string;
};

export type AssessmentSchedule = {
  id: string;
  assessment_id: string | null;
  paper_code: string | null;
  external_schedule_ref: string | null;
  start_at_utc: string | null;
  timezone: string | null;
  duration_seconds: number | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & Pick<Profile, "auth_user_id" | "app_role" | "display_name">;
        Update: Partial<Profile>;
        Relationships: [];
      };
      owner_settings: {
        Row: OwnerSettings;
        Insert: Partial<OwnerSettings> & Pick<OwnerSettings, "owner_profile_id" | "owner_email">;
        Update: Partial<OwnerSettings>;
        Relationships: [];
      };
      owner_student_links: {
        Row: OwnerStudentLink;
        Insert: Partial<OwnerStudentLink> & Pick<OwnerStudentLink, "owner_profile_id" | "student_profile_id" | "link_type">;
        Update: Partial<OwnerStudentLink>;
        Relationships: [];
      };
      student_credentials: {
        Row: StudentCredential;
        Insert: Partial<StudentCredential> & Pick<StudentCredential, "student_profile_id" | "login_code" | "activation_code_hash">;
        Update: Partial<StudentCredential>;
        Relationships: [];
      };
      assessments: {
        Row: Assessment;
        Insert: Partial<Assessment> & Pick<Assessment, "owner_profile_id" | "title" | "assessment_kind">;
        Update: Partial<Assessment>;
        Relationships: [];
      };
      assessment_versions: {
        Row: AssessmentVersion;
        Insert: Partial<AssessmentVersion> & Pick<AssessmentVersion, "assessment_id" | "version_no" | "status" | "source_kind">;
        Update: Partial<AssessmentVersion>;
        Relationships: [];
      };
      question_nodes: {
        Row: QuestionNodeRow;
        Insert: Partial<QuestionNodeRow> & Pick<QuestionNodeRow, "assessment_version_id" | "node_key" | "ordinal" | "node_type" | "response_mode">;
        Update: Partial<QuestionNodeRow>;
        Relationships: [];
      };
      attempts: {
        Row: Attempt;
        Insert: Omit<Attempt, "created_at" | "updated_at" | "state_cache"> & {
          state_cache?: AttemptState | null;
        };
        Update: Partial<Attempt>;
        Relationships: [];
      };
      attempt_sessions: {
        Row: AttemptSession;
        Insert: Partial<AttemptSession> & Pick<AttemptSession, "attempt_id">;
        Update: Partial<AttemptSession>;
        Relationships: [];
      };
      attempt_events: {
        Row: AttemptEvent;
        Insert: Partial<AttemptEvent> & Pick<AttemptEvent, "attempt_id" | "event_type">;
        Update: Partial<AttemptEvent>;
        Relationships: [];
      };
      text_responses: {
        Row: TextResponse;
        Insert: Partial<TextResponse> & Pick<TextResponse, "attempt_id" | "question_node_id">;
        Update: Partial<TextResponse>;
        Relationships: [];
      };
      upload_slots: {
        Row: UploadSlot;
        Insert: Partial<UploadSlot> & Pick<UploadSlot, "attempt_id" | "question_node_id" | "status">;
        Update: Partial<UploadSlot>;
        Relationships: [];
      };
      moderation_reports: {
        Row: ModerationReport;
        Insert: Partial<ModerationReport> & Pick<ModerationReport, "attempt_id" | "summary_json">;
        Update: Partial<ModerationReport>;
        Relationships: [];
      };
      assessment_schedule: {
        Row: AssessmentSchedule;
        Insert: Partial<AssessmentSchedule>;
        Update: Partial<AssessmentSchedule>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_upload_slots_for_attempt: {
        Args: { target_attempt_id: string };
        Returns: number;
      };
      generate_moderation_summary: {
        Args: { target_attempt_id: string };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
