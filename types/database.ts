import type { AppRole, AssessmentKind, AttemptState, DeliveryMode } from "@/lib/constants";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Profile = {
  id: string;
  auth_user_id: string;
  app_role: AppRole;
  display_name: string;
  owner_profile_id: string | null;
  student_13_plus_attested_at: string | null;
  student_13_plus_attested_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Attempt = {
  id: string;
  assessment_id: string;
  assessment_version_id: string;
  assessment_assignment_id: string | null;
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
  seb_browser_exam_key_hashes: string[];
  seb_config_key_hashes: string[];
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
  encrypted_package_path: string | null;
  kms_provider: string | null;
  wrapped_data_key: string | null;
  encryption_metadata_json: Json;
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
  file_size_bytes: number | null;
  content_type: string | null;
  confirmed_by_profile_id: string | null;
  locked_at: string | null;
  is_blank_placeholder: boolean;
  status: "pending" | "uploaded" | "blank_placeholder" | "missing" | "rejected";
  created_at: string;
  updated_at: string;
};

export type StudentGroup = {
  id: string;
  owner_profile_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type StudentGroupMember = {
  id: string;
  group_id: string;
  student_profile_id: string;
  created_at: string;
};

export type AssessmentAssignment = {
  id: string;
  owner_profile_id: string;
  assessment_id: string;
  assessment_version_id: string;
  assignment_kind: "individual" | "group";
  student_profile_id: string | null;
  student_group_id: string | null;
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
  created_at: string;
};

export type Rubric = {
  id: string;
  assessment_version_id: string;
  owner_profile_id: string;
  title: string;
  total_marks: number;
  created_at: string;
  updated_at: string;
};

export type RubricCriteria = {
  id: string;
  rubric_id: string;
  question_node_id: string | null;
  ordinal: number;
  label: string;
  description: string | null;
  max_marks: number;
  created_at: string;
};

export type Mark = {
  id: string;
  attempt_id: string;
  question_node_id: string | null;
  rubric_criteria_id: string | null;
  marker_profile_id: string;
  awarded_marks: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type SubmissionAnnotation = {
  id: string;
  attempt_id: string;
  question_node_id: string | null;
  owner_profile_id: string;
  annotation_type: "note" | "rubric" | "moderation" | "feedback" | "student_flag";
  body: string;
  anchor_json: Json;
  created_at: string;
  updated_at: string;
};

export type FeedbackRelease = {
  id: string;
  attempt_id: string;
  released_by_profile_id: string;
  released_at: string;
  summary_text: string | null;
  total_awarded_marks: number;
  total_available_marks: number;
  visible_to_student: boolean;
  created_at: string;
};

export type ParseJob = {
  id: string;
  assessment_version_id: string;
  owner_profile_id: string;
  source_object_path: string;
  parser: "mineru" | "mineru_hosted" | "latex_deterministic" | "json_validator" | "deepseek_ai" | "qti_import";
  status: "queued" | "running" | "succeeded" | "failed" | "review_required";
  requested_ocr: boolean;
  error_message: string | null;
  result_object_path: string | null;
  external_provider: "mineru_hosted" | null;
  external_batch_id: string | null;
  external_task_id: string | null;
  external_data_id: string | null;
  external_state: string | null;
  metadata_json: Json;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ParseJobArtifact = {
  id: string;
  parse_job_id: string;
  artifact_kind: "markdown" | "json" | "html" | "layout" | "log" | "zip" | "ai_json" | "qti_zip";
  object_path: string;
  content_preview: string | null;
  created_at: string;
};

export type OwnerAuditLog = {
  id: string;
  owner_profile_id: string;
  actor_auth_user_id: string;
  action: string;
  target_table: string | null;
  target_id: string | null;
  metadata_json: Json;
  created_at: string;
};

export type RetentionRequest = {
  id: string;
  owner_profile_id: string;
  requested_by_profile_id: string;
  target_type: "student" | "assessment" | "attempt" | "upload" | "report";
  target_id: string;
  status: "pending" | "completed" | "rejected";
  notes: string | null;
  created_at: string;
  completed_at: string | null;
};

export type AiParseSuggestion = {
  id: string;
  assessment_version_id: string;
  parse_job_id: string | null;
  owner_profile_id: string;
  provider: string;
  model: string;
  source_kind: "pdf" | "latex" | "json" | "mineru";
  normalized_package_json: Json;
  confidence: number;
  warnings_json: Json;
  review_required: boolean;
  status: "proposed" | "applied" | "rejected";
  created_at: string;
};

export type EncryptedObjectEnvelope = {
  id: string;
  owner_profile_id: string;
  bucket_id: string;
  object_path: string;
  kms_provider: "cloudflare";
  algorithm: "AES-GCM";
  wrapped_data_key: string;
  iv: string;
  metadata_json: Json;
  created_at: string;
};

export type MarkingPacketExport = {
  id: string;
  attempt_id: string;
  owner_profile_id: string;
  bucket_id: string;
  object_path: string;
  encrypted: boolean;
  encrypted_envelope_id: string | null;
  manifest_json: Json;
  created_at: string;
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
      student_groups: {
        Row: StudentGroup;
        Insert: Partial<StudentGroup> & Pick<StudentGroup, "owner_profile_id" | "name">;
        Update: Partial<StudentGroup>;
        Relationships: [];
      };
      student_group_members: {
        Row: StudentGroupMember;
        Insert: Partial<StudentGroupMember> & Pick<StudentGroupMember, "group_id" | "student_profile_id">;
        Update: Partial<StudentGroupMember>;
        Relationships: [];
      };
      assessment_assignments: {
        Row: AssessmentAssignment;
        Insert: Partial<AssessmentAssignment> &
          Pick<AssessmentAssignment, "owner_profile_id" | "assessment_id" | "assessment_version_id" | "assignment_kind" | "start_at_utc" | "duration_seconds" | "end_at_utc">;
        Update: Partial<AssessmentAssignment>;
        Relationships: [];
      };
      rubrics: {
        Row: Rubric;
        Insert: Partial<Rubric> & Pick<Rubric, "assessment_version_id" | "owner_profile_id" | "title">;
        Update: Partial<Rubric>;
        Relationships: [];
      };
      rubric_criteria: {
        Row: RubricCriteria;
        Insert: Partial<RubricCriteria> & Pick<RubricCriteria, "rubric_id" | "ordinal" | "label" | "max_marks">;
        Update: Partial<RubricCriteria>;
        Relationships: [];
      };
      marks: {
        Row: Mark;
        Insert: Partial<Mark> & Pick<Mark, "attempt_id" | "marker_profile_id" | "awarded_marks">;
        Update: Partial<Mark>;
        Relationships: [];
      };
      submission_annotations: {
        Row: SubmissionAnnotation;
        Insert: Partial<SubmissionAnnotation> & Pick<SubmissionAnnotation, "attempt_id" | "owner_profile_id" | "annotation_type" | "body">;
        Update: Partial<SubmissionAnnotation>;
        Relationships: [];
      };
      feedback_releases: {
        Row: FeedbackRelease;
        Insert: Partial<FeedbackRelease> & Pick<FeedbackRelease, "attempt_id" | "released_by_profile_id">;
        Update: Partial<FeedbackRelease>;
        Relationships: [];
      };
      parse_jobs: {
        Row: ParseJob;
        Insert: Partial<ParseJob> & Pick<ParseJob, "assessment_version_id" | "owner_profile_id" | "source_object_path" | "parser" | "status">;
        Update: Partial<ParseJob>;
        Relationships: [];
      };
      parse_job_artifacts: {
        Row: ParseJobArtifact;
        Insert: Partial<ParseJobArtifact> & Pick<ParseJobArtifact, "parse_job_id" | "artifact_kind" | "object_path">;
        Update: Partial<ParseJobArtifact>;
        Relationships: [];
      };
      owner_audit_logs: {
        Row: OwnerAuditLog;
        Insert: Partial<OwnerAuditLog> & Pick<OwnerAuditLog, "owner_profile_id" | "actor_auth_user_id" | "action">;
        Update: Partial<OwnerAuditLog>;
        Relationships: [];
      };
      retention_requests: {
        Row: RetentionRequest;
        Insert: Partial<RetentionRequest> & Pick<RetentionRequest, "owner_profile_id" | "requested_by_profile_id" | "target_type" | "target_id" | "status">;
        Update: Partial<RetentionRequest>;
        Relationships: [];
      };
      ai_parse_suggestions: {
        Row: AiParseSuggestion;
        Insert: Partial<AiParseSuggestion> & Pick<AiParseSuggestion, "assessment_version_id" | "owner_profile_id" | "model" | "source_kind" | "normalized_package_json" | "confidence">;
        Update: Partial<AiParseSuggestion>;
        Relationships: [];
      };
      encrypted_object_envelopes: {
        Row: EncryptedObjectEnvelope;
        Insert: Partial<EncryptedObjectEnvelope> & Pick<EncryptedObjectEnvelope, "owner_profile_id" | "bucket_id" | "object_path" | "kms_provider" | "algorithm" | "wrapped_data_key" | "iv">;
        Update: Partial<EncryptedObjectEnvelope>;
        Relationships: [];
      };
      marking_packet_exports: {
        Row: MarkingPacketExport;
        Insert: Partial<MarkingPacketExport> & Pick<MarkingPacketExport, "attempt_id" | "owner_profile_id" | "object_path" | "manifest_json">;
        Update: Partial<MarkingPacketExport>;
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
      audit_owner_action: {
        Args: { action: string; target_table?: string | null; target_id?: string | null; metadata_json?: Json };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
