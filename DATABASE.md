# Database

The base migration is `supabase/migrations/202605050001_initial_schema.sql`. Production Browser Mode additions live in
`supabase/migrations/202605060001_production_browser_mode.sql`. Production completion additions for SEB, AI parse,
QTI, KMS envelopes, and marking packet exports live in
`supabase/migrations/202605060002_full_production_completion.sql`.

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
- `feedback_releases`
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

The TypeScript equivalent of the state machine lives in `lib/attempt-state.ts` and is covered by tests.

## RLS Summary

- Owners can manage profiles, students, assessments, versions, question trees, attempts, sessions, events, responses, upload slots, and reports in their estate.
- Students can read their own assigned attempts and insert their own events.
- Students cannot directly query assessment package JSON or question nodes for content release.
- Student response writes are constrained to their own attempts and valid active timing windows.
- Moderation reports are owner-only by default.
- Owner-created groups and group memberships are owner-managed; students can only see group links involving themselves.
- Marking, rubrics, annotations, feedback releases, parse jobs, retention requests, and audit logs are owner-managed.
- Students can read released feedback/marks only after an explicit visible feedback release.

## Indexes

Indexes cover profile role lookup, owner assessment lookup, version status, question node ordering, assignee attempts,
sessions, events, responses, upload slots, moderation reports, schedule references, student groups, assignments, marking,
feedback releases, parser jobs, and owner audit logs.

## Production Constraints

- `upload_slots` includes file metadata and enforces PDF content type plus a 10MB maximum when file size is known.
- `marks` and `feedback_releases` store owner-controlled marking totals; feedback is invisible to students until released.
- `profiles.student_13_plus_attested` records owner attestation without collecting date of birth.
- `parse_jobs` and `parse_job_artifacts` model self-hosted MinerU output as draft evidence for owner review.
- `parse_jobs.parser` supports `mineru`, `deepseek_ai`, and `qti_import` draft workflows.
- `attempts` stores expected SEB Browser Exam Key and Config Key hashes for `seb_required` delivery.
- `assessment_versions` can point at encrypted normalized package objects and associated wrapped data keys.
- `encrypted_object_envelopes` tracks Cloudflare KMS envelope metadata for encrypted package and marking packet objects.
- `marking_packet_exports` records owner-only generated ZIP packet paths and audit metadata.

## Backup Warning

Database backups do not automatically include Supabase Storage object contents. Back up private buckets separately and test restoration of both database rows and object paths together.
