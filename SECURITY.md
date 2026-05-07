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

The local Playwright/demo bypass is controlled by `EXAM_VAULT_DEMO_MODE=1`; the GitHub Pages static export uses
`NEXT_PUBLIC_STATIC_EXPORT=1` to pre-render demo-safe pages because static hosting has no request-time auth context.
Neither mode grants database access. Real data and sensitive actions still require Supabase Auth, RLS, and Edge Function
checks.

## Owner MFA

Production Browser Mode requires owner AAL2/TOTP before sensitive owner actions: creating students, creating groups,
publishing and assigning assessments, saving marking changes, exporting marking packets, exporting mark CSVs, and
releasing feedback. The browser can show MFA setup and status, but Edge Functions enforce AAL2 from the JWT claim.

Students use owner-managed aliases and passwords by default. Passkeys are optional beta after activation and must keep a
password fallback until the Supabase passkey API is stable enough for the deployment.

## RLS Model

RLS is enabled on all public tables. Owners can manage their own assessment estate. Students can read their own profile and assigned attempt metadata. Sensitive content and privileged changes go through Edge Functions. Attempt events are append-only for students.

## Private Bucket Model

Real assessment material and submissions stay in private buckets. Public URLs are not used. Signed URLs are issued on demand and only after state, ownership, slot, and policy checks.

Upload slots enforce one PDF per question/subquestion, max 10MB. A confirmed upload or blank placeholder locks the slot;
replacement is not supported in production v1.

## Parsing And AI Boundaries

Hosted MinerU receives PDFs only from Supabase Edge Functions using server-side `MINERU_API_KEY` and short-lived access
to private source objects. The browser never receives the MinerU token. Hosted parsing means PDFs are processed by
MinerU's service; use self-hosted parsing instead for assessments that cannot leave infrastructure you control.

MinerU output is draft evidence for owner review, not a trusted publishable result.

DeepSeek is used for AI-assisted parse suggestions. The DeepSeek API key is a Supabase Edge secret only. AI output is
validated as a normalized package proposal, stored with warnings and `review_required = true`, and must be accepted or
edited by the owner before publish.

## State Token Model

`get-attempt-state` issues a short-lived HMAC state token signed with `ATTEMPT_STATE_TOKEN_SECRET`. The token contains the attempt, profile, computed state, server time, expiry, delivery mode, and optional session details. The token is not the source of truth; every sensitive Edge Function recomputes state server-side.

Package release, text response saving, upload URL issuance, upload confirmation, blank slot submission, and finalization
verify the token signature and still recompute state/ownership server-side before changing data.

## SEB Secure Mode

`delivery_mode = seb_required` blocks package release unless server-side validation receives expected Browser Exam Key and
Config Key hashes. Classic SEB headers and the JavaScript API relay path are accepted inputs. User-agent checks alone are
insufficient and are not used as proof.

## External KMS

The Cloudflare KMS wrapper implements envelope-key wrapping for server-side callers. Application code generates a data
key, encrypts the package or marking packet with AES-GCM, stores only ciphertext in Supabase Storage, and stores the
wrapped data key plus metadata in Postgres. If KMS wrapping fails, sensitive object writes fail rather than silently
storing plaintext in KMS-required paths.

## Future Hardening

- External rate limiting and anomaly alerts around Edge Functions.
- KMS key rotation procedures and recovery drills.
- Formal legal review before under-13 learners, school records, or third-party marketing integrations are introduced.
