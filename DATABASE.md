# Database

The main migration is `supabase/migrations/202605050001_initial_schema.sql`.

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

All primary keys are UUIDs. Core enum-like fields use `check` constraints. Attempts store UTC timing fields and a display timezone.

## Helper Functions

- `current_app_role()`
- `is_owner()`
- `current_profile_id()`
- `compute_attempt_state(...)`
- `create_upload_slots_for_attempt(uuid)`
- `generate_moderation_summary(uuid)`

The TypeScript equivalent of the state machine lives in `lib/attempt-state.ts` and is covered by tests.

## RLS Summary

- Owners can manage profiles, students, assessments, versions, question trees, attempts, sessions, events, responses, upload slots, and reports in their estate.
- Students can read their own assigned attempts and insert their own events.
- Students cannot directly query assessment package JSON or question nodes for content release.
- Student response writes are constrained to their own attempts and valid active timing windows.
- Moderation reports are owner-only by default.

## Indexes

Indexes cover profile role lookup, owner assessment lookup, version status, question node ordering, assignee attempts, sessions, events, responses, upload slots, moderation reports, and schedule references.

## Backup Warning

Database backups do not automatically include Supabase Storage object contents. Back up private buckets separately and test restoration of both database rows and object paths together.

