# Exam Vault Security Stress Test Report

Date: 2026-06-15  
Mode: defensive launch-readiness QA  
Checklist source: `/Users/erichuang/Downloads/ai_app_security_stress_test_checklist.pdf`

## Scope And Limits

The request used placeholder production assets:

- Frontend URL: `<APP_URL>`
- API base URL: `<API_BASE_URL>`
- Admin URL: `<ADMIN_URL>`
- Storage/CDN domain: `<STORAGE_OR_CDN_DOMAIN>`
- Auth provider: `<AUTH_PROVIDER>`
- Database/storage provider: `<SUPABASE/FIREBASE/CUSTOM/etc>`
- AI/LLM provider: `<LLM_PROVIDER>`
- SMS/email provider: `<SMS_EMAIL_PROVIDER>`

Because real staging URLs, credentials, and designated test accounts were not provided, this pass did not perform active internet testing, account creation, brute force simulation, storage probing, SMS/email sends, or live data access. The assessment below is a static/local code and configuration review of the Exam Vault repository, with concrete low-risk reproduction plans for a staging environment.

## Test Account Matrix

These accounts were requested by the checklist but were not created because the live/staging asset details were placeholders.

| Account | Status | Notes |
| --- | --- | --- |
| Unauthenticated visitor | Not created | Covered by route/static inspection only. |
| Normal user A | Pending staging setup | Should be a student profile assigned to a test assessment. |
| Normal user B | Pending staging setup | Needed for IDOR/BOLA validation against user A. |
| Suspended/banned user | Not found in model | No clear suspended/banned account state was found in the local scan. |
| Unverified user | Pending staging setup | Relevant to activation/login flows. |
| Verified user | Pending staging setup | Student and owner variants needed. |
| Moderator | Not applicable in current model | Marker assignment exists, but no separate moderator auth role was identified. |
| Admin/owner | Pending staging setup | Owner with AAL2 required for sensitive owner functions. |
| Deleted/deactivated user | Not found in model | No clear deactivated-user auth state was found in the local scan. |

## Asset Map

### Public And Auth Routes

- `/`
- `/login`
- `/activate`
- `/browser-mode`
- `/privacy`
- `/terms`
- `/data-retention`
- `/templates/normalized-assessment.json`

### Owner Routes

- `/owner`
- `/owner/assessments`
- `/owner/assessments/new`
- `/owner/assessments/[id]`
- `/owner/assessments/[id]/review`
- `/owner/assessments/[id]/publish`
- `/owner/assessments/[id]/health`
- `/owner/assessments/[id]/markscheme`
- `/owner/assessments/[id]/cross-mark`
- `/owner/attempts`
- `/owner/attempts/[id]`
- `/owner/attempts/[id]/mark`
- `/owner/attempts/[id]/report`
- `/owner/attempts/[id]/recovery`
- `/owner/attempts/[id]/receipt`
- `/owner/attempts/[id]/corrections`
- `/owner/marking-queue`
- `/owner/feedback-releases`
- `/owner/comment-bank`
- `/owner/question-bank`
- `/owner/question-bank/[questionId]`
- `/owner/question-bank/import-from-assessment`
- `/owner/paper-generator`
- `/owner/students`
- `/owner/cohorts`
- `/owner/templates`
- `/owner/topics`
- `/owner/mistakes`
- `/owner/operations`
- `/owner/support`
- `/owner/security`

### Student Routes

- `/student`
- `/student/command-center`
- `/student/timeline`
- `/student/archive`
- `/student/feedback`
- `/student/progress`
- `/student/results`
- `/student/mistake-patterns`
- `/student/devices`
- `/student/accessibility`
- `/student/notification-settings`
- `/student/security`
- `/student/attempts/[id]/waiting`
- `/student/attempts/[id]/exam`
- `/student/attempts/[id]/upload`
- `/student/attempts/[id]/finalize`
- `/student/attempts/[id]/finished`
- `/student/attempts/[id]/readiness`
- `/student/attempts/[id]/receipt`
- `/student/attempts/[id]/recovery-status`
- `/student/attempts/[id]/results`
- `/student/attempts/[id]/compare/[rootQuestionNodeId]`
- `/student/attempts/[id]/corrections`

### Next.js API Routes

- `/api/owner/destructive-preview`

### Supabase Edge Functions

- `activate-student`
- `ai-parse-assessment`
- `analyze-upload`
- `assessment-template`
- `attempt-intervention`
- `attempt-recovery`
- `calendar-recommendations`
- `cohort`
- `comment-bank`
- `complete-parse-job`
- `confirm-upload-slot`
- `create-student`
- `create-student-group`
- `create-submission-receipt`
- `delete-assessment`
- `delete-attempt`
- `delete-question-bank-item`
- `export-marks-csv`
- `finalize-attempt`
- `generate-annotated-pdf`
- `get-attempt-package`
- `get-attempt-state`
- `get-student-original-upload-url`
- `get-student-results`
- `ingest-assessment`
- `issue-upload-slot-url`
- `list-student-results`
- `marking-ticket`
- `markscheme-mapper`
- `mineru-poll-hosted-job`
- `mineru-submit-hosted-job`
- `owner-download-marking-packet`
- `owner-sign-storage-url`
- `publish-assessment`
- `qti-export-assessment`
- `qti-import-assessment`
- `record-attempt-event`
- `release-feedback`
- `save-marking`
- `save-text-response`
- `save-work-annotation`
- `seb-handshake`
- `seb-verify-session`
- `set-question-flag`
- `start-attempt-session`
- `submit-blank-slot`
- `summarize-attempt-report`
- `topic-tags`
- `update-question-tree`
- `upload-seb-config`

### Storage Buckets

Migrations create these as private buckets:

- `assessment-sources`
- `assessment-packages`
- `answer-uploads`
- `marking-packets`

### Background Jobs, Webhooks, And Integrations

- Supabase Auth, Postgres, RLS, Storage, and Edge Functions.
- Vercel SSR production deployment path.
- DeepSeek for AI assessment parsing.
- MinerU hosted/self-hosted parsing/OCR workflow.
- Parser worker callback through `complete-parse-job`.
- Cloudflare KMS wrapper for configured cryptographic wrapping.
- Safe Exam Browser BEK/CK request-hash verification.
- Optional passkey/MFA/AAL2 owner-sensitive actions.

## Attack Surface Map

| Surface | Examples | Primary Risks |
| --- | --- | --- |
| Auth and activation | `/login`, `/activate`, Supabase Auth, student login codes | Brute force, activation code guessing, weak lockout, account takeover. |
| Role and route authorization | owner/student layouts, server guards, Edge `requireOwnerAal2`, `requireUser` | Owner/student data crossing, stale profile role, AAL2 bypass. |
| Student exam delivery | waiting, exam, upload, finalize, receipt, results, SEB | Pre-`ACTIVE` content release, client-authoritative state, forged state tokens, SEB trust mistakes. |
| Uploads and storage | source PDFs, answer uploads, SEB config, annotated PDFs, marking packets | Non-PDF files, oversized files, BOLA on signed URLs, public bucket leaks. |
| Owner operations | publish, delete, marking, feedback release, recovery, operations board | Destructive action mistakes, bulk action abuse, unreleased feedback exposure. |
| AI and OCR | DeepSeek parser, MinerU hosted/self-hosted jobs, parse worker callback | Cost abuse, prompt injection, malicious parse artifacts, forged worker callbacks. |
| Feedback and UGC | marking tickets, comments, feedback snippets, student incident reports | XSS, private note leakage, cross-student read/write. |
| Public discovery/search | public routes, templates JSON, landing pages | Metadata leakage, indexing sensitive paths. |
| Browser/API hardening | CORS, headers, CSP, error handling | Token exposure blast radius, XSS impact, stack leaks. |
| Monitoring and audit | owner audit logs, attempt events, incidents | Missing alerting, silent failures, insufficient anomaly detection. |

## Findings

| ID | Severity | Affected Feature | Exact Risk | Safe Reproduction Steps | Evidence | Expected Secure Behavior | Recommended Fix | Regression Test To Add |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EV-SEC-001 | High | Owner storage signed URL issuance for `assessment-sources` | The owner authorization query interpolates attacker-controlled `object_path` into a PostgREST `.or()` filter. A crafted path can alter the authorization predicate and may allow an owner to authorize one owned row while receiving a signed URL for a different requested storage object. | In staging, authenticate as owner with AAL2. Call `owner-sign-storage-url` for `bucket: "assessment-sources"` and `purpose: "assessment_source"` using an `object_path` containing PostgREST filter separator/control syntax that also references an assessment the owner does own. Confirm whether the function returns a signed URL for the original requested object path instead of rejecting it. Use only synthetic bucket objects. | `supabase/functions/owner-sign-storage-url/index.ts:20` validates only path shape, `:26` signs the requested path, and `:64` interpolates the path into `.or(...)`. | The requested object path must exactly match an object reference owned by the caller. Filter syntax must never be influenced by object paths. | Replace the interpolated `.or()` with two separate exact `.eq()` queries, or a server-side RPC that takes parameters safely. After lookup, compare the returned stored path exactly to the requested path before signing. Consider rejecting commas/parentheses used by PostgREST filter grammar for object paths where not needed. | Unit/integration test: crafted object paths containing comma/parenthesis/filter syntax return `400` or `403` and never call `createSignedUrl`; exact owned paths still succeed. |
| EV-SEC-002 | High | Student answer upload confirmation | `confirm-upload-slot` trusts client-supplied `file_size_bytes` and `content_type` and does not prove the object exists, is actually a PDF, is within size policy, or matches expected file content before locking the slot as uploaded. | In staging with a synthetic attempt, request an upload URL, upload a non-PDF or mismatched object if storage permits, then call `confirm-upload-slot` with `content_type: "application/pdf"` and a small `file_size_bytes`. Confirm whether the slot locks as uploaded. Also test calling confirm without completing upload. | `supabase/functions/confirm-upload-slot/index.ts:37-42` validates expected path and client metadata; `:54-67` locks the slot with that metadata. | Server must verify the uploaded object before accepting it: object exists, actual size under limit, actual MIME/magic bytes are PDF, and ideally page count/readability is available or queued as pending. | Use Supabase Storage object metadata plus a bounded object read/head verification before locking. Treat upload as `pending_analysis` until `analyze-upload` confirms minimum checks, or run the sanity check synchronously for small PDFs. Enforce bucket-level file-size/MIME limits where possible. | Integration test: fake metadata cannot lock a missing/non-PDF/oversized object; valid PDF locks and records verified metadata. |
| EV-SEC-003 | Medium | Public activation and paid AI/OCR functions | No explicit app-level rate limit or lockout was identified on student activation. Expensive owner parsing functions are AAL2-gated but do not show quota/budget controls. This can allow controlled brute force or cost abuse if credentials/tokens are obtained. | In staging, perform low-volume attempts only: submit repeated invalid activation codes for the same login code and verify whether lockout/backoff/alerts occur. For owner parsing, attempt repeated parse submissions as a test owner and verify quota enforcement. | `supabase/functions/activate-student/index.ts:20-30` performs direct lookup/hash compare without visible rate counters; `supabase/functions/ai-parse-assessment/index.ts` and `mineru-submit-hosted-job` call providers without visible owner quota in the inspected path. | Invalid activation attempts should be rate-limited per login code, IP/device, and time window. Paid provider calls should have owner-level quotas, idempotency, and alerting. | Add rate-limit tables or Edge rate-limit integration, lockout counters, audit events, and provider budget caps. Prefer generic activation errors. Add alerts for spikes. | Tests for activation lockout after N failures, reset after successful activation/timeout, and parse-provider quota denial. |
| EV-SEC-004 | Medium | Edge Function CORS | Shared CORS returns `Access-Control-Allow-Origin: *` while allowing the `Authorization` header. Third-party sites cannot automatically obtain bearer tokens, but wildcard CORS increases the blast radius if tokens are exposed by XSS, browser extensions, logs, or copy/paste. | From a staging static page on a non-app origin, attempt a low-risk authenticated Edge Function request using a test bearer token and observe whether browser CORS permits reading the response. | `supabase/functions/_shared/http.ts:1-7`. | Only configured app origins should read authenticated Edge Function responses. Unknown origins should be denied or receive no CORS allow header. | Reflect `Origin` only when it matches `APP_ALLOWED_ORIGINS`; include `Vary: Origin`; keep SEB request-hash headers allowed; fail closed for unknown origins. | CORS tests for allowed production/staging/local origins and denied arbitrary origins. |
| EV-SEC-005 | Medium | Browser security headers | The app sets useful baseline headers, but no Content-Security-Policy or Strict-Transport-Security header was found in Next.js config. Missing CSP increases XSS impact; missing HSTS weakens transport hardening on custom domains. | In staging, inspect response headers for core pages and confirm no CSP/HSTS. | `next.config.ts:14-23` includes `X-Frame-Options`, `nosniff`, `Referrer-Policy`, and `Permissions-Policy`, but not CSP/HSTS. | Production responses should include a CSP tailored to Supabase/Vercel/PDF/KaTeX requirements and HSTS on HTTPS domains. | Add a report-only CSP first, then enforce. Include `frame-ancestors 'none'`, strict script/style/image/connect directives, and HSTS with preload only after domain validation. | Header snapshot tests or Playwright assertions for CSP/HSTS on production-like builds. |
| EV-SEC-006 | Medium | Parser worker callback | `complete-parse-job` uses a static shared secret header. There is no timestamped HMAC, replay nonce, or status-transition guard visible in the inspected function. If the worker secret leaks, parse jobs can be forged or replayed. | In staging only, call `complete-parse-job` with the test worker secret twice for the same synthetic parse job and observe whether replay/status regression is accepted. | `supabase/functions/complete-parse-job/index.ts:21-28` checks a static `x-mineru-worker-secret`; `:31-65` updates parse job/version state. | Worker callbacks should be authenticated, fresh, non-replayable, and constrained to expected status transitions for the specific job. | Use HMAC over raw body plus timestamp and job id, reject stale timestamps, store callback nonce/job completion state, and require job to be in an expected in-progress state before completion. | Tests for stale timestamp, replayed callback, wrong HMAC, and invalid status transition. |
| EV-SEC-007 | Info | Local secrets hygiene | `.env.local` contains server-only secrets in the developer environment. It is not tracked and no history entry was found, but local secrets remain a workstation exposure risk. | Verify `.env.local` remains ignored and absent from Git history. | `git ls-files` and `git log --all -- .env*` returned no tracked entries. Secret use in code is server/Edge only in inspected matches. | Secrets must remain outside client bundles and source control. | Keep secrets in Vercel/Supabase secret stores, rotate if copied into shared tools/logs, and continue scanning for `NEXT_PUBLIC_` misuse. | Secret scanning in CI for server-only variable names and accidental `.env` commits. |
| EV-SEC-008 | Info | Dynamic launch testing gap | This report could not validate live staging behavior, account separation, browser headers on deployed domains, storage bucket runtime settings, or RLS using real policies because URLs/accounts were placeholders. | Provide staging URLs and synthetic accounts, then run the dynamic plan below. | Scope placeholders in the request. | Launch sign-off should include live low-risk validation with synthetic data. | Run the staging dynamic test plan and attach evidence before production launch. | CI/checklist item requiring completed dynamic security QA artifact before launch. |

## Security Controls Observed Working In Code

- Owner/student route separation uses server-side profile checks in `requireAppRole`.
- Edge Functions use bearer-token validation through Supabase Auth for sensitive student/owner actions.
- Owner-sensitive functions commonly require AAL2.
- Exam package release recomputes server-side attempt state and denies content before allowed states.
- SEB support validates URL-specific Browser Exam Key and Config Key request hashes rather than trusting user-agent strings.
- Student answer upload URL issuance uses server-computed state, state tokens, ownership checks, and root-question upload-slot semantics.
- Storage buckets are created private in migrations.
- Forward hardening migrations remove direct student access to assessment packages, answer uploads, and direct result tables.
- Student results and original upload access are mediated through server/Edge paths.
- AI parser output is designed to remain owner-review-required and pass through deterministic repair.
- KMS behavior is documented as fail-closed when configured.

## Launch Readiness

### Blockers Before Launch

1. Fix EV-SEC-001 before production launch. The signed URL boundary is a high-value access-control gate and should not include interpolated filter syntax.
2. Fix EV-SEC-002 before high-stakes use. Student upload acceptance should be based on server-verified storage object metadata/content, not client-reported metadata.

### Should Fix Soon

- EV-SEC-003: add activation and AI/OCR rate limits, quotas, and alerts.
- EV-SEC-004: restrict Edge Function CORS to configured app origins.
- EV-SEC-005: add CSP and HSTS.
- EV-SEC-006: replace static parse-worker callback auth with signed, timestamped, replay-resistant callbacks.

### Acceptable Risks With Clear Documentation

- Browser Mode remains tamper-evident, not tamper-proof.
- Demo mode is acceptable only for local testing and should remain fail-closed in production.
- Local untracked secrets are acceptable for development if not copied to logs, reports, or commits.
- Dynamic testing is pending because staging assets/accounts were not supplied; this is acceptable only if completed before launch.

## Monitoring And Alerting Gaps

- No app-level rate-limit telemetry was confirmed for activation, AI parsing, MinerU calls, or upload URL issuance.
- No provider-cost alerting was confirmed for DeepSeek/MinerU.
- No storage anomaly alerting was confirmed for repeated signed URL requests or upload failures.
- No deployed-domain CSP report endpoint was confirmed.
- No alert was confirmed for repeated denied owner/student authorization attempts.

## Recommended Dynamic Staging Test Plan

Run these only against designated staging assets and synthetic test accounts:

1. Auth: invalid login, invalid activation, repeated invalid activation, password reset/change, unverified and activated states.
2. Role access: student A cannot open student B routes, owner routes, owner Edge Functions, or owner signed URLs.
3. Owner access: owner A cannot sign owner B storage paths or open owner B attempts/assessments.
4. Storage: all buckets private; no object reachable without a server-issued signed URL.
5. Uploads: valid PDF accepted; missing/non-PDF/oversized/spoofed metadata rejected; retry behavior stays root-question-only.
6. Exam timing: package denied before `ACTIVE`; upload denied outside allowed windows; finalization uses server state.
7. SEB: normal browser cannot unlock `seb_required`; valid BEK/CK request hashes work; expired verified session denied.
8. Feedback: unreleased marks/comments/annotated PDFs hidden; released items visible only to owning student.
9. UGC/XSS: comments, feedback snippets, incident descriptions, flag notes, and parse HTML sanitize script/event-handler payloads.
10. AI/OCR: parser prompt-injection content cannot publish automatically, expose secrets, or bypass owner review.
11. CORS/CSRF: arbitrary origins cannot read authenticated API responses after CORS hardening.
12. Headers: CSP/HSTS/security headers present on deployed production-like domains.

## Final Gate

Current status: not launch-ready for production until EV-SEC-001 is fixed and EV-SEC-002 is either fixed or explicitly accepted only for low-stakes pilots. After those fixes, run the dynamic staging plan with synthetic accounts and attach evidence before production launch.
