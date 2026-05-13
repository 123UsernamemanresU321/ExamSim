# Edge Functions

All sensitive functions validate authentication, parse JSON input, and use server-side authorization helpers. State-sensitive functions recompute attempt state before acting. Shared error handling maps authentication errors to `401/403`, validation and state conflicts to `400/409`, provider failures to `502`, and unexpected failures to `500`.

## create-student

Owner AAL2 only. Input: `{ display_name, student_13_plus_attested }`. Creates an internal Supabase Auth student,
profile, credential row, and owner link. Returns `login_code` and one-time `activation_code`. Stores only the activation
hash and records the owner 13+ attestation.

## activate-student

Public activation boundary. Input: `{ login_code, activation_code, new_password }`. Validates the hash, marks activation, and sets the student's password or completes the configured auth flow.

## ingest-assessment

Owner only. Creates assessment and draft version from JSON, LaTeX, or PDF upload. JSON is Zod-validated. LaTeX parsing
is deterministic and conservative for common Olympiad/IB patterns. PDF source files are uploaded through the Edge
Function into private `assessment-sources`; the owner UI no longer asks for a raw Storage path. PDF parsing creates a
review-required stub and a `parse_jobs` row for hosted MinerU when `MINERU_PROVIDER=hosted`. Normalized package objects
are written to private Storage; when the Cloudflare KMS wrapper is configured, package object writes are
envelope-encrypted.

## update-question-tree

Owner only. Replaces the draft question tree before publish. Accepts either an editable flat node array or a normalized
package/suggestion wrapper with `questions`. The function validates duplicate node keys, missing parents, parent cycles,
and published-version immutability, then calls `replace_question_tree_for_version` so the old tree is not deleted unless
the replacement and package update both succeed.

## publish-assessment

Owner AAL2 only. Validates the reviewed draft, publishes an immutable version, computes UTC timing, creates assigned
attempts for individual students and selected groups/classes, and creates upload slots when enabled.

## delete-assessment

Owner AAL2 only. Deletes an assessment and its cascading versions, attempts, responses, slots, reports, parse jobs, and
known private Storage objects. Storage removal is best-effort and warnings are written into the owner audit log.

## get-attempt-state

Student or owner. Input: `{ attempt_id, attempt_session_id? }`. Returns server-computed state, server time, countdown
target, policy details, and a short-lived state token. When `attempt_session_id` is supplied, the token is bound to that
session after the function verifies the session belongs to the same attempt.

## start-attempt-session

Student only for own attempt. Creates a session and stores hashes for user agent, IP, device id, and future SEB metadata.

## seb-verify-session

Student only for own attempt. Input: `{ attempt_id, attempt_session_id, state_token, mode, browser_exam_request_hash?,
config_key_request_hash?, page_url?, seb_version? }`. Requires a session-bound state token and a matching active
attempt session. Header mode verifies official `X-SafeExamBrowser-RequestHash` and `X-SafeExamBrowser-ConfigKeyHash`
against the Edge Function request URL. JavaScript API mode verifies the supplied request hashes against an allowlisted
`/student/attempts/{attempt_id}/exam` page URL. On success it stores request-hash evidence, method, URL, SEB version, and
`seb_verified_at` on `attempt_sessions`.

## get-attempt-package

Student only for own attempt. Validates ownership, fresh state, token, and delivery mode. Denies content during
`WAITING`. Returns `{ assessment_package, asset_urls, state, seb_verified }` only when server state permits. Package
asset signed URLs are generated server-side from private `assessment-packages` and are never returned before server
state is `ACTIVE`, `UPLOAD_ONLY`, or `FINISHED_REVIEW`. `seb_required` attempts additionally require a state token bound
to an attempt session. The function accepts valid current-request SEB headers, or a still-current verified attempt
session whose stored request hashes still match the attempt configuration and verification URL.

## upload-seb-config

Owner AAL2 only. Input: `{ assessment_id, version_id, file_name, content_base64 }`. Accepts `.seb` files up to 1MB,
stores them in private `assessment-sources` under a controlled owner/assessment/version path, and audits the upload.

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

Student only for own attempt. Autosaves typed, multiple-choice, and numerical answers during `ACTIVE` when typed
responses are enabled. Multiple-choice and numerical submissions are validated against the question node response mode
and stored as structured JSON in `text_responses.answer_text`; `upload_pdf` and `none` nodes are rejected.

## set-question-flag

Student only for own attempt. Input: `{ attempt_id, question_node_id, flagged, state_token }`. Validates the state token,
recomputes attempt state, checks that the question belongs to the released attempt version, and records the flag through
server-side `submission_annotations` writes plus an audit event. The browser no longer inserts flag rows directly.

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

Worker-secret only. Legacy/self-hosted MinerU worker callback used to mark parse jobs succeeded, failed, or
review-required and attach private Storage artifact paths. MinerU output is draft parse evidence; owner review remains
mandatory.

## mineru-submit-hosted-job

Owner AAL2 only. Submits a queued PDF parse job to hosted MinerU using `MINERU_API_KEY` from Supabase Edge secrets.
The Edge Function defaults to MinerU's file-upload URL flow, uploads the private source PDF server-to-server, stores the
MinerU batch id on `parse_jobs`, and never exposes the MinerU token to the browser. A running job can be force-restarted
from the owner review UI if the provider stays pending for too long.

## mineru-poll-hosted-job

Owner AAL2 only. Polls hosted MinerU by batch id, downloads the completed result ZIP, uploads the ZIP and extracted
Markdown/JSON/HTML/log artifacts to private `assessment-packages`, and marks the parse job `review_required`. Provider
errors and stale running jobs are persisted as `failed` so the owner can restart instead of seeing an endless running
state.

## ai-parse-assessment

Owner AAL2 only. Calls DeepSeek through its OpenAI-compatible chat completions API using Supabase Edge secrets. Inputs
can include current normalized JSON, LaTeX source, MinerU artifact text, or owner notes. Stores a review-required
`ai_parse_suggestions` row and a parse job record. It never publishes AI output directly.

## qti-import-assessment

Owner AAL2 only. Accepts a QTI ZIP as base64, reads `imsmanifest.xml`, creates an assessment and review-required draft
version, stores the original QTI ZIP in private `assessment-sources`, and creates conservative question nodes for owner
review. The importer maps QTI choice interactions to `multiple_choice`, numeric response declarations to `numerical`,
and otherwise falls back to `typed_text`.

## qti-export-assessment

Owner AAL2 only. Converts a normalized package into a conservative QTI ZIP with `imsmanifest.xml`, item XML files, and
`exam-vault-normalized-package.json`, stores the ZIP in private `marking-packets`, and returns a short-lived signed URL.

## save-marking

Owner AAL2 only. Saves marks and submission annotations for an attempt. Does not release student-visible feedback.

## release-feedback

Owner AAL2 only. Computes totals, upserts `feedback_releases`, and makes feedback visible only when explicitly requested.

## export-marks-csv

Owner AAL2 only. Exports owner-visible marks summary as CSV.

## record-attempt-event

Student only for own attempt. Inserts append-only telemetry events such as fullscreen, visibility, focus, heartbeat,
reconnect, and upload events. If an `attempt_session_id` is supplied, the function verifies it belongs to the attempt
and updates `attempt_sessions.last_heartbeat_at` for heartbeat events.

## summarize-attempt-report

Owner or scheduled job. Aggregates telemetry, upload slots, hidden time, heartbeat gaps, and timeline into `moderation_reports`.

## owner-download-marking-packet

Owner AAL2 only. Builds a real ZIP containing the assessment package, question tree, typed responses, upload manifest,
short-lived upload download links, moderation report, marks, annotations, feedback release state, and audit manifest.
If the Cloudflare KMS wrapper is configured, the ZIP object is AES-GCM encrypted before it is written to private Storage.

## owner-sign-storage-url

Owner AAL2 only. Issues short-lived signed URLs for owner-only parse artifacts, answer uploads, and marking packet
objects after checking the object belongs to the owner. Every issuance is audited. This replaces direct client-side
Storage signing in parse review and marking views.

## get-student-results

Student or owner. Returns released student feedback only through a checked Edge boundary. Students receive sanitized
question metadata, marks, feedback annotations, and their own response summaries only after `feedback_releases` is
visible. Moderation reports, attempt events, private package objects, and unreleased feedback remain owner-only.

## list-student-results

Student only. Lists the student's attempts with visible feedback releases and sanitized assessment metadata. This keeps
the student results list off direct `feedback_releases`/`assessments` browser queries after direct student result
policies are removed.
