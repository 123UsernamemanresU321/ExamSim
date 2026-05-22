# Security

## Threat Model

Exam Vault protects assessment content before release, student submissions, owner workflows, and moderation evidence. Expected attackers include curious students, authenticated students attempting to read other attempts, students manipulating browser time, and users trying to bypass upload or content gates.

Browser Mode does not prevent all local tampering. It records evidence such as fullscreen exits, visibility changes, reconnects, and heartbeat gaps, but these are moderation signals requiring owner review.

## Server Time Is Authoritative

The browser never decides state transitions. Client countdowns use `server_now_utc` only for display. When a countdown reaches zero, the client must call `get-attempt-state` again. Edge Functions and SQL helpers recompute state using server time before releasing content, issuing upload URLs, saving responses, or finalizing.

## No Pre-Active Payload Release

The waiting screen renders metadata only. Students do not receive assessment package JSON, source paths, question rows, or hidden content while state is `WAITING`. Direct broad student `SELECT` policies are intentionally not granted on `assessment_versions` or `question_nodes`.

Owner PDF source uploads go through `ingest-assessment`, which writes the file to the private `assessment-sources` bucket
with server credentials. The browser does not need a public URL or raw private Storage path to create a PDF assessment.

## Authorization Model

Roles are `owner` and `student`. Authorization uses app metadata and the `profiles` table, not mutable user metadata. `OWNER_EMAIL` is server-only and should be used during owner provisioning. Student personas are separate student profiles linked to the owner; they are not role toggles inside owner sessions.

The `/owner` and `/student` route groups enforce server-side role guards on Vercel/Next.js runtime requests. A user
without a session is sent to `/login`, and a signed-in user with the wrong role is redirected to their own dashboard.
These guards improve navigation and admin isolation, but RLS and Edge Function authorization remain the data security
boundary.

The local Playwright/demo bypass is controlled by `EXAM_VAULT_DEMO_MODE=1` and is ignored in production builds. It does
not grant database access. Real data and sensitive actions always require Supabase Auth, RLS, and Edge Function checks.

Production requires Vercel SSR. Static export hosting is not supported because it cannot refresh Supabase sessions or
run server-side route guards at request time.

## Marking Annotations And Discussions

Marker annotations are stored as a separate review layer, not by mutating the student's original typed answer or uploaded
PDF. Owner-created work annotations require AAL2 and are audited. Students see only the released annotated PDF copy by
default after the owner explicitly releases feedback. Original uploaded PDFs are not embedded on the student results
page; a student must explicitly request a short-lived original-upload URL, and that request is logged.

Feedback release is granular. Marks, student-facing comments, annotated PDFs, and moderation summaries are hidden until
the owner explicitly releases the relevant category. Private marker notes, comment bank snippets, unreleased annotation
JSON, markscheme mapping drafts, and owner recovery records are never returned to student clients.

The owner annotation studio renders the actual uploaded PDF page with a same-sized annotation layer above it. The PDF
canvas/text layer is noninteractive while annotating, so pointer events go to the annotation layer instead of selecting
the page. Annotation geometry is stored as normalized `annotation-v2` coordinates, which keeps marks aligned across
zoom changes and lets the server flatten annotations into a new private PDF copy.

Generated annotated PDFs are written to private `marking-packets` objects and linked from `upload_slots`; the original
submitted file remains unchanged and is still the evidence source.

Marking discussion tickets are also Edge-mediated. Students can open or reply only for their own released results.
Owner replies, owner-created tickets, and owner status changes require AAL2. Direct student RLS access is not granted for
work annotations or ticket tables.

## Owner MFA

Production Browser Mode requires owner AAL2/TOTP before sensitive owner actions: creating students, creating groups,
publishing and assigning assessments, saving marking changes, exporting marking packets, exporting mark CSVs, releasing
feedback, and deleting assessments, attempts, or question-bank items. The browser can show MFA setup and status, but
Edge Functions enforce AAL2 from the JWT claim.

Students use owner-managed aliases and passwords by default. Passkeys are optional beta after activation and must keep a
password fallback until the Supabase passkey API is stable enough for the deployment.

## RLS Model

RLS is enabled on all public tables. Owners can manage their own assessment estate. Students can read their own profile and assigned attempt metadata. Sensitive content and privileged changes go through Edge Functions. Attempt events are append-only for students.

Advanced learning workflow tables follow the same boundary:

- Paper health checks, question bank items, generated papers, and mistake category definitions are owner-only.
- Mistake instances are student-readable only when explicitly marked student-visible and feedback has been released.
- Correction notebooks and entries are visible/writeable to the assigned student only after a visible feedback release.
- Private marker notes, unreleased annotations, question bank metadata, generated paper criteria, and paper health blockers
  are not student-readable.

## Private Bucket Model

Real assessment material and submissions stay in private buckets. Public URLs are not used. Signed URLs are issued on demand and only after state, ownership, slot, and policy checks.

Deletion workflows are owner-only Edge Functions. Individual attempt deletion removes the attempt's known private
answer-upload and marking-packet objects before deleting the metadata row. Question-bank item deletion removes only the
reusable bank record and generated-paper references; it does not delete the original private assessment source files.

Upload slots enforce one PDF per root/main question, max 10MB. Subquestions and deeper parts receive marks and feedback,
but do not receive separate student submission slots. A confirmed upload or blank placeholder locks the slot;
replacement is not supported in production v1.

Upload sanity checks are advisory moderation/marking evidence, not a replacement for owner review. The Edge fallback
checks metadata and estimated page counts server-side; deeper OCR, handwriting readability, and blank-page detection
should be handled by a trusted worker before those warnings are used operationally.

Incidents, accommodations, and recovery actions are additive audit records. They explain or repair an attempt workflow
without deleting original attempt events, upload attempts, or moderation evidence.

## Parsing And AI Boundaries

Hosted MinerU receives PDFs only from Supabase Edge Functions using server-side `MINERU_API_KEY`. The default hosted
path requests a MinerU upload URL and sends the private PDF server-to-server, avoiding public URLs and signed URL fetch
timeouts. The browser never receives the MinerU token. Hosted parsing means PDFs are processed by MinerU's service; use
self-hosted parsing instead for assessments that cannot leave infrastructure you control.

MinerU output is draft evidence for owner review, not a trusted publishable result.

DeepSeek is used for AI-assisted parse suggestions. The DeepSeek API key is a Supabase Edge secret only. AI output is
validated as a normalized package proposal, stored with warnings and `review_required = true`, and must be accepted or
edited by the owner before publish.

## State Token Model

`get-attempt-state` issues a short-lived HMAC state token signed with `ATTEMPT_STATE_TOKEN_SECRET`. The token contains the attempt, profile, computed state, server time, expiry, delivery mode, and optional session details. The token is not the source of truth; every sensitive Edge Function recomputes state server-side.

Package release, text response saving, upload URL issuance, upload confirmation, blank slot submission, and finalization
verify the token signature and still recompute state/ownership server-side before changing data.

## SEB Secure Mode

`delivery_mode = seb_required` blocks package release unless server-side validation proves both the Browser Exam Key and
Config Key for the exact request/page URL. Owners paste the copied 64-character BEK and CK values after saving the final
`.seb` configuration. Edge Functions then verify URL-specific SHA-256 request hashes over the canonical URL with fragments
removed: BEK uses copied key plus URL; CK uses URL plus copied key.

Classic SEB clients can provide official request headers:

- `X-SafeExamBrowser-RequestHash`
- `X-SafeExamBrowser-ConfigKeyHash`

Modern macOS/iOS SEB WKWebView clients that cannot send those headers use the JavaScript API relay path. The relay is
accepted only for allowed app origins and the exact `/student/attempts/{attempt_id}/exam` page. It verifies a
session-bound state token before storing `seb_verified_at`, request-hash evidence, the verification URL, method, and
optional SEB version on the attempt session. Normal browser body fields, fake client state, and user-agent strings are
not accepted as proof.

Required Edge configuration:

- `APP_ALLOWED_ORIGINS=https://examvault.tutor-mcp.com,https://exam-vault-zeta.vercel.app,http://localhost:3000`
- `SEB_SESSION_VERIFICATION_TTL_SECONDS=300`

## External KMS

The Cloudflare KMS wrapper implements envelope-key wrapping for server-side callers. Application code generates a data
key, encrypts the package or marking packet with AES-GCM, stores only ciphertext in Supabase Storage, and stores the
wrapped data key plus metadata in Postgres. If KMS wrapping fails, sensitive object writes fail rather than silently
storing plaintext in KMS-required paths.

## Future Hardening

- External rate limiting and anomaly alerts around Edge Functions.
- KMS key rotation procedures and recovery drills.
- Formal legal review before under-13 learners, school records, or third-party marketing integrations are introduced.
