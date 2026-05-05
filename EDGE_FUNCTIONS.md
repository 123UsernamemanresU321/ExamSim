# Edge Functions

All sensitive functions validate authentication, parse JSON input, and use server-side authorization helpers. State-sensitive functions recompute attempt state before acting.

## create-student

Owner only. Input: `{ display_name }`. Creates an internal Supabase Auth student, profile, credential row, and owner link. Returns `login_code` and one-time `activation_code`. Stores only the activation hash.

## activate-student

Public activation boundary. Input: `{ login_code, activation_code, new_password }`. Validates the hash, marks activation, and sets the student's password or completes the configured auth flow.

## ingest-assessment

Owner only. Creates assessment and draft version from JSON, LaTeX, PDF path, or pasted source. JSON is Zod-validated. LaTeX parsing is deterministic and conservative. PDF parsing creates a review-required stub.

## update-question-tree

Owner only. Replaces the draft question tree before publish.

## publish-assessment

Owner only. Validates the reviewed draft, publishes an immutable version, computes UTC timing, creates assigned attempts, and creates upload slots when enabled.

## get-attempt-state

Student or owner. Returns server-computed state, server time, countdown target, policy details, and short-lived state token.

## start-attempt-session

Student only for own attempt. Creates a session and stores hashes for user agent, IP, device id, and future SEB metadata.

## get-attempt-package

Student only for own attempt. Validates ownership, fresh state, token, and delivery mode. Denies content during `WAITING`. Returns normalized package only when server state permits.

## issue-upload-slot-url

Student only for own attempt. Allows upload URL issuance during `ACTIVE` when policy permits or during `UPLOAD_ONLY`. Denies after `FINISHED_REVIEW` and denies slots outside the attempt.

## confirm-upload-slot

Student only for own attempt. Confirms the uploaded object path and updates the trusted slot row after state and slot validation.

## submit-blank-slot

Student only for own attempt. Records a standardized blank placeholder for a slot.

## save-text-response

Student only for own attempt. Autosaves typed answers during `ACTIVE` when typed responses are enabled.

## finalize-attempt

Student only for own attempt. Finalizes typed responses, marks missing upload slots after deadline, and records finalization evidence.

## Next.js Live Wiring

The Next.js owner/student screens now read live Supabase metadata through RLS-aware server clients. Mutating owner and
student forms invoke Supabase Edge Functions with the signed-in user's access token, preserving the Edge Function
security boundary for student creation, ingestion, question tree review, publishing, package release, responses, and
uploads.

## record-attempt-event

Student only for own attempt. Inserts append-only telemetry events such as fullscreen, visibility, focus, heartbeat, reconnect, and upload events.

## summarize-attempt-report

Owner or scheduled job. Aggregates telemetry, upload slots, hidden time, heartbeat gaps, and timeline into `moderation_reports`.

## owner-download-marking-packet

Owner only. Returns secure access instructions for original package, question tree, typed responses, uploads, and moderation report.
