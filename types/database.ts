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
  seb_config_path: string | null;
  state_cache: AttemptState | null;
  created_at: string;
  updated_at: string;
};

export type OwnerSettings = {
  id: string;
  owner_profile_id: string;
  owner_email: string;
  default_timezone: string;
  comment_bank: Json;
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
  subject: string | null;
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
  markscheme_html: string | null;
  markscheme_pdf_path: string | null;
  markscheme_source_kind: "pdf" | "latex" | "json" | null;
  markscheme_source_object_path: string | null;
  published_at: string | null;
  created_at: string;
};

export type QuestionNodeRow = {
  id: string;
  assessment_version_id: string;
  parent_node_id: string | null;
  root_question_id?: string | null;
  node_key: string;
  display_label?: string | null;
  depth?: number | null;
  ordinal_path?: number[] | null;
  sort_key?: string | null;
  ordinal: number;
  node_type: "section" | "question" | "subquestion" | "part";
  title: string | null;
  prompt_html: string | null;
  prompt_latex: string | null;
  marks: number | null;
  response_mode: "none" | "typed_text" | "upload_pdf" | "typed_or_upload" | "multiple_choice" | "numerical";
  interaction_json: Json | null;
  markscheme_html: string | null;
  markscheme_pdf_path?: string | null;
  mark_mode?: "manual" | "computed" | null;
  assets: string[] | null;
  source_page_start: number | null;
  source_page_end: number | null;
  source_region_json?: Json | null;
  has_visual_assets?: boolean | null;
  visual_asset_refs?: string[] | null;
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
  original_file_name: string | null;
  uploaded_at: string | null;
  file_size_bytes: number | null;
  content_type: string | null;
  confirmed_by_profile_id: string | null;
  locked_at: string | null;
  annotated_object_path: string | null;
  annotated_generated_at: string | null;
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
  seb_config_path: string | null;
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
  annotation_type: "note" | "rubric" | "moderation" | "feedback" | "student_flag" | "marker_flag";
  body: string;
  anchor_json: Json;
  is_unreadable: boolean;
  created_at: string;
  updated_at: string;
};

export type WorkAnnotation = {
  id: string;
  attempt_id: string;
  question_node_id: string;
  upload_slot_id: string | null;
  text_response_id: string | null;
  owner_profile_id: string;
  annotation_kind: "typed_text" | "uploaded_pdf" | "general";
  visibility: "private" | "student_visible";
  severity: "note" | "minor" | "major" | "critical";
  body: string;
  anchor_json: Json;
  created_at: string;
  updated_at: string;
};

export type MarkingTicket = {
  id: string;
  attempt_id: string;
  question_node_id: string | null;
  work_annotation_id: string | null;
  owner_profile_id: string;
  student_profile_id: string;
  opened_by_profile_id: string;
  subject: string;
  status: "open" | "owner_review" | "student_reply" | "resolved" | "closed";
  created_at: string;
  updated_at: string;
};

export type MarkingTicketMessage = {
  id: string;
  ticket_id: string;
  author_profile_id: string;
  author_role: "owner" | "student";
  body: string;
  created_at: string;
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
  release_marks?: boolean;
  release_comments?: boolean;
  release_annotated_pdfs?: boolean;
  release_moderation_summary?: boolean;
  release_note?: string | null;
  scheduled_release_at?: string | null;
  revoked_at?: string | null;
  superseded_by_release_id?: string | null;
  created_at: string;
};

export type UploadSanityCheck = {
  id: string;
  upload_slot_id: string;
  status: "accepted" | "accepted_with_warnings" | "needs_review" | "failed";
  file_name: string | null;
  file_size_bytes: number | null;
  file_hash: string | null;
  content_type: string | null;
  page_count: number | null;
  preview_object_path: string | null;
  warnings_json: Json;
  checks_json: Json;
  created_at: string;
};

export type MarkschemeDocument = {
  id: string;
  assessment_id: string;
  assessment_version_id: string;
  source_object_path: string;
  status: "uploaded" | "parsed" | "review_required" | "approved";
  created_at: string;
};

export type MarkschemeNode = {
  id: string;
  markscheme_document_id: string;
  node_key: string | null;
  normalized_key: string | null;
  ordinal_path: number[] | null;
  mapped_question_node_id: string | null;
  markscheme_html: string | null;
  source_page_start: number | null;
  source_page_end: number | null;
  confidence: number | null;
  status: "mapped" | "unmatched" | "ignored" | "needs_review";
  created_at: string;
};

export type CommentBankItem = {
  id: string;
  owner_profile_id: string;
  label: string;
  comment_text: string;
  category: string | null;
  subject: string | null;
  tags: string[];
  is_student_facing_default: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
};

export type AttemptIncident = {
  id: string;
  attempt_id: string;
  created_by_profile_id: string;
  incident_type: "internet_issue" | "power_cut" | "wrong_upload" | "medical" | "browser_crash" | "admin_note" | "other";
  description: string;
  severity: "low" | "medium" | "high";
  affects_marking: boolean;
  student_visible: boolean;
  created_at: string;
};

export type AttemptAccommodation = {
  id: string;
  attempt_id: string;
  created_by_profile_id: string;
  accommodation_type: "extra_time" | "upload_extension" | "manual_reopen_upload" | "ignore_moderation_signal" | "other";
  extra_seconds: number | null;
  reason: string;
  applied_at: string;
};

export type TopicTag = {
  id: string;
  owner_profile_id: string;
  subject: string;
  tag: string;
  parent_tag_id: string | null;
  created_at: string;
};

export type QuestionTopicLink = {
  id: string;
  question_node_id: string;
  topic_tag_id: string;
  weight: number;
  created_at: string;
};

export type CalendarRecommendation = {
  id: string;
  owner_profile_id: string;
  student_profile_id: string;
  assessment_id: string | null;
  paper_code: string | null;
  topic_tag_id: string | null;
  reason: string;
  priority: "low" | "medium" | "high";
  suggested_minutes: number;
  status: "pending" | "accepted" | "dismissed" | "exported";
  created_at: string;
};

export type AssessmentTemplate = {
  id: string;
  owner_profile_id: string;
  name: string;
  description: string | null;
  assessment_kind: AssessmentKind;
  default_duration_seconds: number;
  default_upload_grace_seconds: number | null;
  delivery_mode: DeliveryMode;
  solutions_requested: boolean;
  typed_enabled: boolean;
  per_question_upload_enabled: boolean;
  require_blank_for_skipped: boolean;
  default_timezone: string;
  policy_json: Json;
  created_at: string;
  updated_at: string;
};

export type Cohort = {
  id: string;
  owner_profile_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type CohortMember = {
  id: string;
  cohort_id: string;
  student_profile_id: string;
  created_at: string;
};

export type SubmissionReceipt = {
  id: string;
  attempt_id: string;
  receipt_json: Json;
  created_at: string;
};

export type AttemptRecoveryAction = {
  id: string;
  attempt_id: string;
  owner_profile_id: string;
  action_type: "repair_upload_metadata" | "grant_upload_extension" | "owner_replace_upload" | "mark_resolved" | "log_note";
  upload_slot_id: string | null;
  details_json: Json;
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

export type AssessmentHealthCheck = {
  id: string;
  assessment_id: string;
  assessment_version_id: string | null;
  status: "ready" | "warning" | "blocked" | "not_checked";
  score: number;
  blockers_json: Json;
  warnings_json: Json;
  checks_json: Json;
  last_checked_at: string;
  overridden_by_profile_id: string | null;
  override_reason: string | null;
  created_at: string;
};

export type MistakeCategory = {
  id: string;
  owner_profile_id: string;
  name: string;
  description: string | null;
  color: string | null;
  parent_category_id: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type MistakeInstance = {
  id: string;
  attempt_id: string;
  question_node_id: string;
  category_id: string;
  created_by_profile_id: string;
  severity: "minor" | "moderate" | "major";
  note: string | null;
  linked_mark_delta: number | null;
  student_visible: boolean;
  created_at: string;
};

export type QuestionBankItem = {
  id: string;
  owner_profile_id: string;
  source_assessment_id: string | null;
  source_assessment_version_id: string | null;
  source_question_node_id: string | null;
  title: string | null;
  root_node_key: string;
  prompt_html: string | null;
  prompt_latex: string | null;
  source_pdf_object_path: string | null;
  source_page_start: number | null;
  source_page_end: number | null;
  source_region_json: Json | null;
  marks_available: number | null;
  estimated_difficulty: number | null;
  assessment_kind: AssessmentKind | null;
  subject: string | null;
  paper_code: string | null;
  tags: string[];
  topic_tag_ids: string[];
  has_visual_assets: boolean;
  visual_asset_refs: Json;
  answer_mode: "none" | "upload_pdf" | "typed_text" | "typed_or_upload" | "multiple_choice" | "numerical";
  markscheme_html: string | null;
  markscheme_refs: Json;
  do_not_reuse: boolean;
  created_at: string;
  updated_at: string;
};

export type QuestionBankChild = {
  id: string;
  question_bank_item_id: string;
  node_key: string;
  parent_node_key: string | null;
  ordinal_path: number[];
  prompt_html: string | null;
  prompt_latex: string | null;
  marks_available: number | null;
  markscheme_html: string | null;
  created_at: string;
};

export type GeneratedPaper = {
  id: string;
  owner_profile_id: string;
  title: string;
  subject: string | null;
  target_marks: number | null;
  target_duration_seconds: number | null;
  criteria_json: Json;
  status: "draft" | "converted_to_assessment" | "discarded";
  converted_assessment_id: string | null;
  created_at: string;
  updated_at: string;
};

export type GeneratedPaperItem = {
  id: string;
  generated_paper_id: string;
  question_bank_item_id: string;
  ordinal: number;
  included_marks: number | null;
  locked: boolean;
  created_at: string;
};

export type CorrectionNotebook = {
  id: string;
  attempt_id: string;
  student_profile_id: string;
  status: "not_started" | "in_progress" | "submitted" | "reviewed";
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CorrectionEntry = {
  id: string;
  notebook_id: string;
  question_node_id: string;
  root_question_node_id: string;
  correction_text: string | null;
  reflection_text: string | null;
  corrected_upload_object_path: string | null;
  confidence_after_correction: number | null;
  status: "draft" | "submitted" | "reviewed";
  owner_feedback: string | null;
  created_at: string;
  updated_at: string;
};

export type StudentDeviceCheck = {
  id: string;
  student_profile_id: string;
  attempt_id: string | null;
  device_id_hash: string | null;
  user_agent_hash: string | null;
  checks_json: Json;
  status: "passed" | "warning" | "failed";
  created_at: string;
};

export type StudentDevice = {
  id: string;
  student_profile_id: string;
  device_id_hash: string;
  display_name: string | null;
  user_agent_hash: string | null;
  browser_label: string | null;
  last_check_status: "passed" | "warning" | "failed" | null;
  last_seen_at: string;
  created_at: string;
};

export type StudentNotificationPreferences = {
  id: string;
  student_profile_id: string;
  exam_24h: boolean;
  exam_1h: boolean;
  exam_10m: boolean;
  upload_deadline_10m: boolean;
  feedback_released: boolean;
  correction_reviewed: boolean;
  browser_notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type StudentNotification = {
  id: string;
  student_profile_id: string;
  type: string;
  title: string;
  body: string;
  link_url: string | null;
  read_at: string | null;
  created_at: string;
};

export type AssessmentMaterial = {
  id: string;
  assessment_id: string;
  assessment_version_id: string;
  title: string;
  material_type: "formula_booklet" | "data_booklet" | "annex" | "instructions" | "reference" | "other";
  object_path: string | null;
  content_html: string | null;
  visibility_policy: "before_exam" | "active_only" | "after_finish" | "always" | "owner_only";
  created_at: string;
};

export type StudentAccessibilityPreferences = {
  id: string;
  student_profile_id: string;
  preferences_json: Json;
  created_at: string;
  updated_at: string;
};

export type StudentPerformancePreferences = {
  id: string;
  student_profile_id: string;
  low_bandwidth_mode: boolean;
  created_at: string;
  updated_at: string;
};

export type UploadQueueEvent = {
  id: string;
  upload_slot_id: string;
  student_profile_id: string;
  event_type: string;
  payload_json: Json;
  created_at: string;
};

export type StudentIncidentReport = {
  id: string;
  attempt_id: string;
  student_profile_id: string;
  incident_type: "internet_issue" | "power_cut" | "browser_crash" | "upload_problem" | "wrong_file_uploaded" | "scanner_camera_issue" | "medical_issue" | "other";
  description: string;
  affected_question_node_id: string | null;
  payload_json: Json;
  status: "submitted" | "reviewed" | "resolved" | "rejected";
  created_at: string;
};

export type StudentRecoveryCode = {
  id: string;
  student_profile_id: string;
  code_hash: string;
  used_at: string | null;
  created_at: string;
};

export type StudentFeedbackRead = {
  id: string;
  student_profile_id: string;
  attempt_id: string;
  feedback_release_id: string | null;
  read_at: string | null;
  created_at: string;
};

export type StudentConfidenceRating = {
  id: string;
  student_profile_id: string;
  attempt_id: string;
  question_node_id: string;
  topic_tag_id: string | null;
  confidence: number;
  note: string | null;
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
      upload_sanity_checks: {
        Row: UploadSanityCheck;
        Insert: Partial<UploadSanityCheck> & Pick<UploadSanityCheck, "upload_slot_id" | "status">;
        Update: Partial<UploadSanityCheck>;
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
      work_annotations: {
        Row: WorkAnnotation;
        Insert: Partial<WorkAnnotation> & Pick<WorkAnnotation, "attempt_id" | "question_node_id" | "owner_profile_id" | "annotation_kind" | "body">;
        Update: Partial<WorkAnnotation>;
        Relationships: [];
      };
      marking_tickets: {
        Row: MarkingTicket;
        Insert: Partial<MarkingTicket> & Pick<MarkingTicket, "attempt_id" | "owner_profile_id" | "student_profile_id" | "opened_by_profile_id" | "subject">;
        Update: Partial<MarkingTicket>;
        Relationships: [];
      };
      marking_ticket_messages: {
        Row: MarkingTicketMessage;
        Insert: Partial<MarkingTicketMessage> & Pick<MarkingTicketMessage, "ticket_id" | "author_profile_id" | "author_role" | "body">;
        Update: Partial<MarkingTicketMessage>;
        Relationships: [];
      };
      feedback_releases: {
        Row: FeedbackRelease;
        Insert: Partial<FeedbackRelease> & Pick<FeedbackRelease, "attempt_id" | "released_by_profile_id">;
        Update: Partial<FeedbackRelease>;
        Relationships: [];
      };
      markscheme_documents: {
        Row: MarkschemeDocument;
        Insert: Partial<MarkschemeDocument> & Pick<MarkschemeDocument, "assessment_id" | "assessment_version_id" | "source_object_path">;
        Update: Partial<MarkschemeDocument>;
        Relationships: [];
      };
      markscheme_nodes: {
        Row: MarkschemeNode;
        Insert: Partial<MarkschemeNode> & Pick<MarkschemeNode, "markscheme_document_id">;
        Update: Partial<MarkschemeNode>;
        Relationships: [];
      };
      comment_bank_items: {
        Row: CommentBankItem;
        Insert: Partial<CommentBankItem> & Pick<CommentBankItem, "owner_profile_id" | "label" | "comment_text">;
        Update: Partial<CommentBankItem>;
        Relationships: [];
      };
      attempt_incidents: {
        Row: AttemptIncident;
        Insert: Partial<AttemptIncident> & Pick<AttemptIncident, "attempt_id" | "created_by_profile_id" | "incident_type" | "description">;
        Update: Partial<AttemptIncident>;
        Relationships: [];
      };
      attempt_accommodations: {
        Row: AttemptAccommodation;
        Insert: Partial<AttemptAccommodation> & Pick<AttemptAccommodation, "attempt_id" | "created_by_profile_id" | "accommodation_type" | "reason">;
        Update: Partial<AttemptAccommodation>;
        Relationships: [];
      };
      topic_tags: {
        Row: TopicTag;
        Insert: Partial<TopicTag> & Pick<TopicTag, "owner_profile_id" | "subject" | "tag">;
        Update: Partial<TopicTag>;
        Relationships: [];
      };
      question_topic_links: {
        Row: QuestionTopicLink;
        Insert: Partial<QuestionTopicLink> & Pick<QuestionTopicLink, "question_node_id" | "topic_tag_id">;
        Update: Partial<QuestionTopicLink>;
        Relationships: [];
      };
      calendar_recommendations: {
        Row: CalendarRecommendation;
        Insert: Partial<CalendarRecommendation> & Pick<CalendarRecommendation, "owner_profile_id" | "student_profile_id" | "reason">;
        Update: Partial<CalendarRecommendation>;
        Relationships: [];
      };
      assessment_templates: {
        Row: AssessmentTemplate;
        Insert: Partial<AssessmentTemplate> & Pick<AssessmentTemplate, "owner_profile_id" | "name" | "assessment_kind" | "default_duration_seconds">;
        Update: Partial<AssessmentTemplate>;
        Relationships: [];
      };
      cohorts: {
        Row: Cohort;
        Insert: Partial<Cohort> & Pick<Cohort, "owner_profile_id" | "name">;
        Update: Partial<Cohort>;
        Relationships: [];
      };
      cohort_members: {
        Row: CohortMember;
        Insert: Partial<CohortMember> & Pick<CohortMember, "cohort_id" | "student_profile_id">;
        Update: Partial<CohortMember>;
        Relationships: [];
      };
      submission_receipts: {
        Row: SubmissionReceipt;
        Insert: Partial<SubmissionReceipt> & Pick<SubmissionReceipt, "attempt_id" | "receipt_json">;
        Update: Partial<SubmissionReceipt>;
        Relationships: [];
      };
      attempt_recovery_actions: {
        Row: AttemptRecoveryAction;
        Insert: Partial<AttemptRecoveryAction> & Pick<AttemptRecoveryAction, "attempt_id" | "owner_profile_id" | "action_type">;
        Update: Partial<AttemptRecoveryAction>;
        Relationships: [];
      };
      assessment_health_checks: {
        Row: AssessmentHealthCheck;
        Insert: Partial<AssessmentHealthCheck> & Pick<AssessmentHealthCheck, "assessment_id">;
        Update: Partial<AssessmentHealthCheck>;
        Relationships: [];
      };
      mistake_categories: {
        Row: MistakeCategory;
        Insert: Partial<MistakeCategory> & Pick<MistakeCategory, "owner_profile_id" | "name">;
        Update: Partial<MistakeCategory>;
        Relationships: [];
      };
      mistake_instances: {
        Row: MistakeInstance;
        Insert: Partial<MistakeInstance> & Pick<MistakeInstance, "attempt_id" | "question_node_id" | "category_id" | "created_by_profile_id">;
        Update: Partial<MistakeInstance>;
        Relationships: [];
      };
      question_bank_items: {
        Row: QuestionBankItem;
        Insert: Partial<QuestionBankItem> & Pick<QuestionBankItem, "owner_profile_id" | "root_node_key">;
        Update: Partial<QuestionBankItem>;
        Relationships: [];
      };
      question_bank_children: {
        Row: QuestionBankChild;
        Insert: Partial<QuestionBankChild> & Pick<QuestionBankChild, "question_bank_item_id" | "node_key" | "ordinal_path">;
        Update: Partial<QuestionBankChild>;
        Relationships: [];
      };
      generated_papers: {
        Row: GeneratedPaper;
        Insert: Partial<GeneratedPaper> & Pick<GeneratedPaper, "owner_profile_id" | "title">;
        Update: Partial<GeneratedPaper>;
        Relationships: [];
      };
      generated_paper_items: {
        Row: GeneratedPaperItem;
        Insert: Partial<GeneratedPaperItem> & Pick<GeneratedPaperItem, "generated_paper_id" | "question_bank_item_id" | "ordinal">;
        Update: Partial<GeneratedPaperItem>;
        Relationships: [];
      };
      correction_notebooks: {
        Row: CorrectionNotebook;
        Insert: Partial<CorrectionNotebook> & Pick<CorrectionNotebook, "attempt_id" | "student_profile_id">;
        Update: Partial<CorrectionNotebook>;
        Relationships: [];
      };
      correction_entries: {
        Row: CorrectionEntry;
        Insert: Partial<CorrectionEntry> & Pick<CorrectionEntry, "notebook_id" | "question_node_id" | "root_question_node_id">;
        Update: Partial<CorrectionEntry>;
        Relationships: [];
      };
      student_device_checks: {
        Row: StudentDeviceCheck;
        Insert: Partial<StudentDeviceCheck> & Pick<StudentDeviceCheck, "student_profile_id" | "checks_json" | "status">;
        Update: Partial<StudentDeviceCheck>;
        Relationships: [];
      };
      student_devices: {
        Row: StudentDevice;
        Insert: Partial<StudentDevice> & Pick<StudentDevice, "student_profile_id" | "device_id_hash">;
        Update: Partial<StudentDevice>;
        Relationships: [];
      };
      student_notification_preferences: {
        Row: StudentNotificationPreferences;
        Insert: Partial<StudentNotificationPreferences> & Pick<StudentNotificationPreferences, "student_profile_id">;
        Update: Partial<StudentNotificationPreferences>;
        Relationships: [];
      };
      student_notifications: {
        Row: StudentNotification;
        Insert: Partial<StudentNotification> & Pick<StudentNotification, "student_profile_id" | "type" | "title" | "body">;
        Update: Partial<StudentNotification>;
        Relationships: [];
      };
      assessment_materials: {
        Row: AssessmentMaterial;
        Insert: Partial<AssessmentMaterial> & Pick<AssessmentMaterial, "assessment_id" | "assessment_version_id" | "title" | "material_type" | "visibility_policy">;
        Update: Partial<AssessmentMaterial>;
        Relationships: [];
      };
      student_accessibility_preferences: {
        Row: StudentAccessibilityPreferences;
        Insert: Partial<StudentAccessibilityPreferences> & Pick<StudentAccessibilityPreferences, "student_profile_id">;
        Update: Partial<StudentAccessibilityPreferences>;
        Relationships: [];
      };
      student_performance_preferences: {
        Row: StudentPerformancePreferences;
        Insert: Partial<StudentPerformancePreferences> & Pick<StudentPerformancePreferences, "student_profile_id">;
        Update: Partial<StudentPerformancePreferences>;
        Relationships: [];
      };
      upload_queue_events: {
        Row: UploadQueueEvent;
        Insert: Partial<UploadQueueEvent> & Pick<UploadQueueEvent, "upload_slot_id" | "student_profile_id" | "event_type">;
        Update: Partial<UploadQueueEvent>;
        Relationships: [];
      };
      student_incident_reports: {
        Row: StudentIncidentReport;
        Insert: Partial<StudentIncidentReport> & Pick<StudentIncidentReport, "attempt_id" | "student_profile_id" | "incident_type" | "description">;
        Update: Partial<StudentIncidentReport>;
        Relationships: [];
      };
      student_recovery_codes: {
        Row: StudentRecoveryCode;
        Insert: Partial<StudentRecoveryCode> & Pick<StudentRecoveryCode, "student_profile_id" | "code_hash">;
        Update: Partial<StudentRecoveryCode>;
        Relationships: [];
      };
      student_feedback_reads: {
        Row: StudentFeedbackRead;
        Insert: Partial<StudentFeedbackRead> & Pick<StudentFeedbackRead, "student_profile_id" | "attempt_id">;
        Update: Partial<StudentFeedbackRead>;
        Relationships: [];
      };
      student_confidence_ratings: {
        Row: StudentConfidenceRating;
        Insert: Partial<StudentConfidenceRating> & Pick<StudentConfidenceRating, "student_profile_id" | "attempt_id" | "question_node_id" | "confidence">;
        Update: Partial<StudentConfidenceRating>;
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
