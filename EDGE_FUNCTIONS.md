# Edge Functions

All sensitive functions validate authentication, parse JSON input, and use server-side authorization helpers. State-sensitive functions recompute attempt state before acting.

## create-student

Owner AAL2 only. Input: `{ display_name, student_13_plus_attested }`. Creates an internal Supabase Auth student,
profile, credential row, and owner link. Returns `login_code` and one-time `activation_code`. Stores only the activation
hash and records the owner 13+ attestation.

## activate-student

Public activation boundary. Input: `{ login_code, activation_code, new_password }`. Validates the hash, marks activation, and sets the student's password or completes the configured auth flow.

## ingest-assessment

Owner only. Creates assessment and draft version from JSON, LaTeX, PDF path, or pasted source. JSON is Zod-validated.
LaTeX parsing is deterministic and conservative for common Olympiad/IB patterns. PDF parsing creates a review-required
stub and a `parse_jobs` row for the self-hosted MinerU worker.

## update-question-tree

Owner only. Replaces the draft question tree before publish.

## publish-assessment

Owner AAL2 only. Validates the reviewed draft, publishes an immutable version, computes UTC timing, creates assigned
attempts for individual students and selected groups/classes, and creates upload slots when enabled.

## get-attempt-state

Student or owner. Returns server-computed state, server time, countdown target, policy details, and short-lived state token.

## start-attempt-session

Student only for own attempt. Creates a session and stores hashes for user agent, IP, device id, and future SEB metadata.

## get-attempt-package

Student only for own attempt. Validates ownership, fresh state, token, and delivery mode. Denies content during `WAITING`. Returns normalized package only when server state permits.

## issue-upload-slot-url

Student only for own attempt. Allows upload URL issuance during `ACTIVE` when policy permits or during `UPLOAD_ONLY`.
Denies after `FINISHED_REVIEW`, denies slots outside the attempt, enforces one current file per slot, and returns a
signed upload token for one PDF path only.

## confirm-upload-slot

Student only for own attempt. Confirms the uploaded object path and updates the trusted slot row after state and slot
validation. Enforces PDF content type, max 10MB file size, and no replacement after successful confirmation.

## submit-blank-slot

Student only for own attempt. Records a standardized blank placeholder for a slot and locks the slot.

## save-text-response

Student only for own attempt. Autosaves typed answers during `ACTIVE` when typed responses are enabled.

## finalize-attempt

Student only for own attempt. Finalizes typed responses, marks missing upload slots after deadline, and records finalization evidence.

## Next.js Live Wiring

The Next.js owner/student screens now read live Supabase metadata through RLS-aware server clients. Mutating owner and
student forms invoke Supabase Edge Functions with the signed-in user's access token, preserving the Edge Function
security boundary for student creation, ingestion, question tree review, publishing, package release, responses, and
uploads.

## create-student-group

Owner AAL2 only. Input: `{ name, description?, student_profile_ids }`. Creates an owner-managed group/class and its
members. Group assignment later expands to one attempt per student.

## complete-parse-job

Worker-secret only. Used by the self-hosted MinerU worker to mark parse jobs succeeded, failed, or review-required and
attach private Storage artifact paths. MinerU output is draft parse evidence; owner review remains mandatory.

## save-marking

Owner AAL2 only. Saves marks and submission annotations for an attempt. Does not release student-visible feedback.

## release-feedback

Owner AAL2 only. Computes totals, upserts `feedback_releases`, and makes feedback visible only when explicitly requested.

## export-marks-csv

Owner AAL2 only. Exports owner-visible marks summary as CSV.

## record-attempt-event

Student only for own attempt. Inserts append-only telemetry events such as fullscreen, visibility, focus, heartbeat, reconnect, and upload events.

## summarize-attempt-report

Owner or scheduled job. Aggregates telemetry, upload slots, hidden time, heartbeat gaps, and timeline into `moderation_reports`.

## owner-download-marking-packet

Owner AAL2 only. Returns secure access instructions or a JSON packet for original package, question tree, typed
responses, uploads, marks, feedback, and moderation report. ZIP generation is a documented next step.
