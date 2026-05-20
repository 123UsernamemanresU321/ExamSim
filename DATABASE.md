# Database

The base migration is `supabase/migrations/202605050001_initial_schema.sql`. Production Browser Mode additions live in
`supabase/migrations/202605060001_production_browser_mode.sql`. Production completion additions for SEB, AI parse,
QTI, KMS envelopes, and marking packet exports live in
`supabase/migrations/202605060002_full_production_completion.sql`.
Hosted MinerU API metadata lives in `supabase/migrations/202605060003_hosted_mineru_api.sql`.
Atomic question-tree review replacement lives in `supabase/migrations/202605070001_atomic_question_tree_review.sql`.
Production content-release boundary hardening lives in
`supabase/migrations/202605120001_harden_content_release_boundaries.sql`.
Numerical response-mode support is added for hosted databases in
`supabase/migrations/202605130002_add_numerical_response_mode.sql`.
Anchored work annotations and marking discussion tickets are added in
`supabase/migrations/202605140002_work_annotations_and_marking_tickets.sql`.
Student upload slot original filename persistence is added in
`supabase/migrations/202605160001_upload_slot_original_file_name.sql`.
Private generated annotated PDF metadata is added in
`supabase/migrations/202605170001_upload_slot_annotated_pdf.sql`.
Question hierarchy metadata and root-question-only upload slot generation are added in
`supabase/migrations/202605170002_question_hierarchy_root_upload_slots.sql`.
The usability workflow package is added in
`supabase/migrations/202605200001_usability_upgrade_package.sql`.

## Tables

- `profiles`
- `owner_settings`
- `owner_student_links`
- `student_credentials`
- `assessments`
- `assessment_versions`
- `question_nodes`
- `attempts`
- `attempt_sessions`
- `attempt_events`
- `text_responses`
- `upload_slots`
- `moderation_reports`
- `assessment_schedule`
- `student_groups`
- `student_group_members`
- `assessment_assignments`
- `rubrics`
- `rubric_criteria`
- `marks`
- `submission_annotations`
- `work_annotations`
- `marking_tickets`
- `marking_ticket_messages`
- `feedback_releases`
- `upload_sanity_checks`
- `markscheme_documents`
- `markscheme_nodes`
- `comment_bank_items`
- `attempt_incidents`
- `attempt_accommodations`
- `topic_tags`
- `question_topic_links`
- `calendar_recommendations`
- `assessment_templates`
- `cohorts`
- `cohort_members`
- `submission_receipts`
- `attempt_recovery_actions`
- `parse_jobs`
- `parse_job_artifacts`
- `ai_parse_suggestions`
- `encrypted_object_envelopes`
- `marking_packet_exports`
- `owner_audit_logs`
- `retention_requests`

All primary keys are UUIDs. Core enum-like fields use `check` constraints. Attempts store UTC timing fields and a display timezone.

## Helper Functions

- `current_app_role()`
- `is_owner()`
- `current_profile_id()`
- `compute_attempt_state(...)`
- `create_upload_slots_for_attempt(uuid)`
- `generate_moderation_summary(uuid)`
- `current_auth_aal()`
- `is_owner_aal2()`
- `audit_owner_action(...)`
- `replace_question_tree_for_version(uuid, jsonb, jsonb)`

The TypeScript equivalent of the state machine lives in `lib/attempt-state.ts` and is covered by tests.

## RLS Summary

- Owners can manage profiles, students, assessments, versions, question trees, attempts, sessions, events, responses, upload slots, and reports in their estate.
- Students can read their own assigned attempts and insert their own events.
- Students cannot directly query assessment package JSON or question nodes for content release.
- Student response writes are constrained to their own attempts and valid active timing windows.
- Moderation reports are owner-only by default.
- Owner-created groups and group memberships are owner-managed; students can only see group links involving themselves.
- Marking, rubrics, annotations, work annotations, feedback releases, parse jobs, retention requests, and audit logs are owner-managed.
- Students read released feedback/marks through the checked `get-student-results` Edge Function after an explicit visible
  feedback release; direct student result policies are not used for question metadata, version rows, marks, feedback
  annotations, work annotations, or marking tickets.
- New usability workflow tables are owner-managed by default. Students can read only their own upload sanity summaries
  and submission receipts; they cannot read comment bank entries, unreleased feedback controls, cohorts, incidents,
  accommodations, recovery actions, private markscheme mapping rows, or calendar recommendations unless a future
  release path explicitly exposes sanitized data.

## Indexes

Indexes cover profile role lookup, owner assessment lookup, version status, question node ordering, assignee attempts,
sessions, events, responses, upload slots, moderation reports, schedule references, student groups, assignments, marking,
feedback releases, work annotations, marking tickets, parser jobs, and owner audit logs.

## Production Constraints

- `upload_slots` includes file metadata and enforces PDF content type plus a 10MB maximum when file size is known.
  It also stores `original_file_name` so the student can verify which PDF was confirmed for that question slot.
- `question_nodes.response_mode` supports `none`, `typed_text`, `upload_pdf`, `typed_or_upload`, `multiple_choice`,
  and `numerical`. Multi-select choices use `interaction_json.max_choices`; numerical answers use
  `interaction_json.kind = "numerical"` with optional numeric bounds/unit metadata.
- `question_nodes` also stores hierarchy metadata (`root_question_id`, `display_label`, `depth`, `ordinal_path`,
  `sort_key`, and `mark_mode`) so root questions, subquestions, and deeper parts can be ordered and marked recursively
  without relying on lexicographic labels. Parser and owner-review paths normalize flat AI output into this metadata
  deterministically, including missing roots such as `Q3` for extracted children like `3(a)(i)`.
- `create_upload_slots_for_attempt` creates upload slots only for root/main question nodes. Subquestions and deeper
  parts never receive separate student upload slots; one uploaded PDF covers all parts of the selected main question.
- Markable subquestion/part leaves may use `response_mode = 'none'` for written PDF-upload papers. They still carry
  marks and feedback, while the student submission and direct PDF annotation layer stay attached to the root question
  upload slot.
- `marks` and `feedback_releases` store owner-controlled marking totals; feedback is invisible to students until released.
- `work_annotations` stores a non-destructive marker annotation layer over typed work and uploaded PDFs. Anchors can point
  to selected typed text, PDF pages, owner-entered locations, and direct-on-document annotation overlays using
  normalized `annotation-v2` coordinates for ink, highlighter, text, stamps, rectangles, circles, arrows, and comments.
  The original student submission is not modified.
- `upload_slots.annotated_object_path` points at the latest owner-generated annotated PDF copy in private
  `marking-packets`; students receive a short-lived URL only after feedback release.
- `marking_tickets` and `marking_ticket_messages` store feedback discussions. Student access is Edge-mediated and only
  available after feedback release for the student's own attempt.
- `upload_sanity_checks` records server-side upload metadata checks and warnings for root-question PDF uploads. Full OCR
  and image-quality classification remain worker responsibilities; the Edge fallback records file type, size, page count,
  renderability signals, duplicate hashes, and timing warnings.
- `markscheme_documents` and `markscheme_nodes` separate markscheme source documents from question nodes. Cover/general
  instruction sections are kept in review or ignored state and must not be silently mapped to Q1.
- `comment_bank_items` stores reusable owner feedback snippets with usage counts for insertion into marker notes or
  student-facing feedback.
- `attempt_incidents`, `attempt_accommodations`, and `attempt_recovery_actions` preserve recovery/audit context without
  deleting original telemetry or upload evidence.
- `topic_tags`, `question_topic_links`, and `calendar_recommendations` support question-level topic tagging and weak-topic
  revision recommendations for calendar export.
- `assessment_templates` stores reusable policy presets for publish settings. `cohorts` and `cohort_members` provide the
  newer bulk-assignment grouping model while older `student_groups` remain for compatibility.
- `submission_receipts` stores a readonly proof JSON after finalization, including slot status, filenames, page counts,
  sanity warnings, and upload hashes when available.
- `profiles.student_13_plus_attested` records owner attestation without collecting date of birth.
- `parse_jobs` and `parse_job_artifacts` model self-hosted MinerU output as draft evidence for owner review.
- `parse_jobs.parser` supports `mineru`, `deepseek_ai`, and `qti_import` draft workflows.
- `parse_jobs` stores hosted MinerU batch ids, external state, and provider metadata when `MINERU_PROVIDER=hosted`.
- `parse_job_artifacts` supports hosted MinerU ZIP artifacts plus extracted Markdown/JSON/HTML/log previews.
- `attempts` stores copied SEB Browser Exam Key and Config Key values for `seb_required` delivery. Package release verifies
  URL-specific request hashes against those copied keys; `attempt_sessions` stores the received request-hash evidence.
- `assessment_versions` can point at encrypted normalized package objects and associated wrapped data keys.
- `encrypted_object_envelopes` tracks Cloudflare KMS envelope metadata for encrypted package and marking packet objects.
- `marking_packet_exports` records owner-only generated ZIP packet paths and audit metadata.
- `replace_question_tree_for_version` replaces reviewed `question_nodes` and the draft package JSON in a single
  database transaction, validates duplicate/missing/cyclic parent keys, and refuses published versions.

## Backup Warning

Database backups do not automatically include Supabase Storage object contents. Back up private buckets separately and test restoration of both database rows and object paths together.
