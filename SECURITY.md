# Security

## Threat Model

Exam Vault protects assessment content before release, student submissions, owner workflows, and moderation evidence. Expected attackers include curious students, authenticated students attempting to read other attempts, students manipulating browser time, and users trying to bypass upload or content gates.

Browser Mode does not prevent all local tampering. It records evidence such as fullscreen exits, visibility changes, reconnects, and heartbeat gaps, but these are moderation signals requiring owner review.

## Server Time Is Authoritative

The browser never decides state transitions. Client countdowns use `server_now_utc` only for display. When a countdown reaches zero, the client must call `get-attempt-state` again. Edge Functions and SQL helpers recompute state using server time before releasing content, issuing upload URLs, saving responses, or finalizing.

## No Pre-Active Payload Release

The waiting screen renders metadata only. Students do not receive assessment package JSON, source paths, question rows, or hidden content while state is `WAITING`. Direct broad student `SELECT` policies are intentionally not granted on `assessment_versions` or `question_nodes`.

## Authorization Model

Roles are `owner` and `student`. Authorization uses app metadata and the `profiles` table, not mutable user metadata. `OWNER_EMAIL` is server-only and should be used during owner provisioning. Student personas are separate student profiles linked to the owner; they are not role toggles inside owner sessions.

## RLS Model

RLS is enabled on all public tables. Owners can manage their own assessment estate. Students can read their own profile and assigned attempt metadata. Sensitive content and privileged changes go through Edge Functions. Attempt events are append-only for students.

## Private Bucket Model

Real assessment material and submissions stay in private buckets. Public URLs are not used. Signed URLs are issued on demand and only after state, ownership, slot, and policy checks.

## State Token Model

`get-attempt-state` issues a short-lived HMAC state token signed with `ATTEMPT_STATE_TOKEN_SECRET`. The token contains the attempt, profile, computed state, server time, expiry, delivery mode, and optional session details. The token is not the source of truth; every sensitive Edge Function recomputes state server-side.

## Future Secure Mode

`delivery_mode = seb_required` and SEB hash fields are present for Safe Exam Browser integration. User-agent checks alone are insufficient. Production SEB support must validate Browser Exam Key and Config Key values server-side.

## Future Hardening

- Owner MFA/AAL2 before publish and assignment.
- Passkey enrollment after student activation.
- External KMS envelope encryption for high-value assessment packages.
- Robust audit logging and rate limiting at Edge Function boundaries.

