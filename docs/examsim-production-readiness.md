# Examsim Production Readiness

Last updated: 2026-06-20

This document records the current production boundary for Examsim. It is intentionally strict: provider-dependent OCR, AI, lockdown, offline, and scan-mapping features must be shown as provider-gated, blocked, manual fallback, or live-validation-required until they are verified end to end on the actual website with synthetic records.

The owner Security page renders this same readiness model through `ExamsimProductionReadinessPanel` and the
configuration-only `ProviderReadinessDashboard`. The dashboard does not send prompts, PDFs, or student data to external
providers; it only reports env/config readiness, recent import-job states, and manual fallback paths.

## Production-ready V1 core

- Exam-code entry and no-login guest sitting through Edge/server validation.
- Roster-first guest identity matching with clear exam code vs student number separation.
- Guest access tokens and server-signed attempt state tokens.
- Server-authoritative exam timing, upload windows, package release, finalization, and sensitive state transitions.
- Guest package release through Edge Functions only.
- Guest SEB-required sessions blocked unless a server-verifiable guest SEB evidence path is implemented.
- Root-question upload slots, private Storage upload, server-side PDF byte verification, upload retry states, and required-upload finalization blocking.
- Live extra-time intervention that mutates effective attempt end/upload-deadline timestamps with audit logging.
- Roster accommodation application for new guest attempts where supported by current policy fields.

## Production-ready V2 surfaces

- Visual PDF source upload from assessment authoring, private `assessment-sources` storage, `source_documents`, `source_pages`, and PDF.js rendering fallback.
- Visual PDF region editor with drawn, draggable, resizable, split, merge, duplicate, delete, normalized-coordinate regions and question-card linking.
- Smart Compiler review surface with Faithful Mode / Smart Mode explanation, provider status, missing-env messaging, and low-confidence review queue.
- Editable answer-type suggestions from command terms. Suggestions are advisory only; teacher-selected response mode remains canonical.
- Source PDF health checks for missing source regions, unlinked question regions, unlinked supporting diagram/table/instruction regions, overlapping boxes, low-confidence unreviewed regions, missing marks/response types, unresolved markscheme mappings, failed PDF processing, compiler review items, and a weighted 0-100 score breakdown.
- LaTeX split editor and deterministic Examsim syntax parsing for questions, answer boxes, and markscheme blocks.
- Markscheme mapping, rubric templates, rubric point authoring, rubric-click marking, per-rubric-item awards, rubric setup total warnings, and Edge-enforced question maximums.
- Deterministic/manual answer grouping as a review aid, including typed normalization, numeric tolerance/unit grouping, blank manual-review buckets, and manual-review table/whiteboard buckets. Marks are never applied automatically without teacher review.
- Owner analytics snapshot from real stored attempts, marks, question nodes, topic links, and rubric awards:
  - score distribution;
  - weakest questions;
  - topic weaknesses;
  - rubric loss breakdown;
  - low-score support flags.
- Live roster foundations for current question, typed response count, upload progress, heartbeat gaps, technical issues, broadcasts, private replies, extra time, pause/resume, and force-submit controls.

## Production-safe V3 additions

- Table response workspace for questions configured through the Visual Question Editor. Student answers are stored as structured JSON in the existing `text_responses` path and remain server/state-token mediated.
- Simple whiteboard response workspace for sketch/drawing answers. Strokes are saved as normalized coordinates so they survive viewport changes; advanced graphing, geometry, CAS, and chemistry tools are not claimed unless a real provider is configured.
- Command-term answer inference now suggests table and whiteboard workspaces for table-completion and drawing/sketching prompts. These suggestions are advisory only; teacher confirmation remains required.
- Deterministic answer grouping treats table and whiteboard responses as manual-review structured groups instead of auto-normalizing them as plain text.
- Owner-facing provider readiness dashboard for OCR/layout extraction, AI/semantic grouping, LaTeX syntax parsing, PDF/source-region handling, private storage, Edge Functions, email/notifications, and export readiness.
- Existing `parse_jobs` rows are normalized into V3 import states: not configured, queued, processing, failed, low confidence, needs review, completed, and retried.
- Import governance guardrails now surface provider pages processed, retry count, estimated cost, owner quota metadata, large-job confirmation warnings, and existing import audit events from `owner_audit_logs`.
- Smart Import sample-paper QA fixtures now track PDF source regions, LaTeX structure, and markscheme-to-rubric mapping without claiming provider success when credentials or reviewed live validation results are absent.
- Batch PDF import preflight now models duplicate filenames, unsupported file types, file-size limits, markscheme grouping, large-batch confirmation, provider availability, and manual fallback before any OCR/provider submission.
- Deployment readiness console lists core env vars, Supabase migrations, RLS, private storage, Edge Functions, provider setup, seed accounts, and security-claim checks with ready/blocked/manual-validation states.
- Institution role matrix foundation adds owner/admin, teacher, marker, reviewer, invigilator, and read-only viewer permissions, an RLS-protected `institution_memberships` table, owner Security page matrix, and role-aware owner sidebar/mobile navigation. This is live-validation-required until every sensitive data loader and route is validated on the actual website with collaborator test accounts.
- Guest exam typed/table/whiteboard answers now keep an attempt-token-bound local browser backup so refresh recovery can restore drafts before the normal Edge autosave resumes. This is not a claim of full offline file submission.
- Owner Export Hub provides owner-only CSV/JSON handoff exports for markbooks, roster reconciliation, groups/cohorts, assessment inventory, and analytics validation. It keeps QTI assessment-scoped through the existing Edge export and labels Moodle XML unsupported until fidelity warnings are validated.
- Hydration-safe form-field help runtime now waits until after browser load before adding tooltip attributes to inputs, preventing server/client attribute mismatches.
- Expiring one-time guest-attempt claim codes are issued and redeemed through checked Edge/RPC boundaries. Automatic linking requires an existing roster/account match; ambiguous claims enter owner review.
- Server-controlled rest breaks persist pause intervals and extend writing/upload deadlines atomically on resume. Student workspaces lock while the server reports `PAUSED`.
- SimpleTeX OCR is deployed as an owner AAL2 Edge workflow with private source signing, quota controls, review-required result rows, and manual PDF-region fallback.
- Institution permissions are enforced by server layouts, server actions, RLS, owner-scoped memberships, and checked timing/identity RPCs for owner/admin, teacher, marker, reviewer, invigilator, and read-only roles.
- Collaborative marking now stores immutable review snapshots, optional anonymous/double-marking policy, moderation decisions, release gating, and database-checked submission/review transitions.
- Deterministic answer groups, members, approvals, mark application, and audit events are persisted with explicit owner/question/attempt linkage checks.

## Owner-facing readiness evidence

| Surface | Evidence | Production boundary |
| --- | --- | --- |
| Provider status dashboard | `components/owner/provider-readiness-dashboard.tsx`, `app/owner/security/page.tsx` | Configuration-only checks. It does not call external providers or expose server-only secrets to the browser. |
| Import job state, sample QA, and governance model | `lib/examsim/provider-readiness.ts`, `components/owner/provider-readiness-dashboard.tsx`, `tests/examsim-v3-provider-readiness.test.ts` | Uses existing `parse_jobs` and `owner_audit_logs`; no new table is required for V3 status, sample QA fixture display, batch PDF preflight, quota, retry, cost, and audit display. |
| Deployment readiness console | `components/owner/deployment-readiness-console.tsx`, `lib/examsim/deployment-readiness.ts`, `tests/examsim-v3-deployment-readiness.test.ts` | Read-only launch checklist. Live RLS/storage/migration validation should run on the actual website and Supabase project with synthetic records. |
| Institution role matrix | `lib/examsim/institution-role-matrix.ts`, `lib/examsim/institution-roles.ts`, `lib/examsim/institution-route-access.ts`, `components/owner/institution-role-matrix-panel.tsx`, `components/owner/sidebar-nav.tsx`, `supabase/migrations/20260618140348_institution_role_matrix.sql`, `supabase/migrations/20260619000400_v3_institution_permission_rollout.sql`, `tests/examsim-v3-institution-roles.test.ts`, `tests/examsim-v3-route-permissions.test.ts` | Owner-scoped collaboration membership, server/RLS permission enforcement, role-aware navigation, and sensitive route layouts are deployed. Multi-account workflow QA remains required before institution-wide use. |
| Live V3 database and Edge rollout | Migrations `20260619000100` through `20260620084239`; deployed functions `claim-guest-attempt`, `owner-issue-attempt-claim-code`, `simpletex-ocr-source-page`, and state/upload/marking functions | Migration history was reconciled against verified live schema markers. New tables use RLS and explicit Data API grants; privileged RPCs revoke anonymous execution. |
| Release-candidate readiness | `lib/examsim-production-readiness.ts`, `components/owner/examsim-production-readiness-panel.tsx`, `tests/examsim-production-readiness-matrix.test.ts` | Explicitly states whether full V3 can be claimed. Current status remains not full V3 ready while blocked, provider-gated, live-validation-required, and manual-fallback items remain. |
| Export Hub | `app/owner/export-hub/page.tsx`, `lib/examsim/export-hub.ts`, `tests/examsim-v3-export-hub.test.ts` | Owner-scoped CSV/JSON handoff exports. QTI remains AAL2 Edge-scoped per assessment; Moodle XML remains visibly unsupported. |
| Compiler review queue | `lib/examsim/compiler-readiness.ts`, `app/owner/assessments/[id]/compiler/page.tsx` | Low-confidence and missing-data items stay review-required before publish. |
| Source coverage score | `lib/paper-health.ts`, `app/owner/assessments/[id]/health/page.tsx`, `tests/examsim-v2-compiler-readiness.test.ts`, `tests/pdf-region-editor-pipeline.test.ts` | Weighted health score and category breakdown for structure, source, markscheme, delivery, marking, and security. It flags unlinked question and supporting regions without touching Storage or publish logic. |
| Rubric total validator | `lib/examsim/rubric-readiness.ts`, `app/owner/assessments/[id]/rubrics/page.tsx`, `components/owner/marking-response-workspace.tsx`, `supabase/functions/save-marking/index.ts`, `tests/rubric-readiness.test.ts`, `tests/marking-scoring.test.ts`, `tests/production-browser-mode.test.ts` | Owners see point-bank totals and question-maximum warnings before marking; the Edge save boundary rejects manual and summed rubric totals above the question maximum. |
| Field help hydration fix | `components/form-field-help-runtime.tsx`, `tests/student-delete-and-field-help.test.ts` | Tooltips are added client-side only after load so React hydration does not see unexpected attributes. |

## Release-candidate readiness

The owner Security page now includes a `Release candidate readiness` summary derived from the same production-readiness matrix. It must read as **not full V3 ready** until all remaining features leave blocked, provider-gated, live-validation-required, or manual-fallback status. The main blockers remain guest SEB lockdown, provider-backed sample-paper OCR validation, Paper Mode auto-mapping, school dashboards, curriculum standard trees, Moodle XML/QTI fidelity, version rollback/diff UX, advanced accommodations/tools, and true offline file submission after browser/process restart.

## Provider-gated V2 features

- Provider-backed Smart Import / Exam Compiler needs `DEEPSEEK_API_KEY` plus `MINERU_API_KEY` or `MINERU_WORKER_HMAC_SECRET`.
- AI/OCR question-region detection has live SimpleTeX and MinerU configuration but still requires reviewed sample-paper validation. Manual PDF regions remain the production fallback.
- STEM/handwriting/table/diagram OCR uses the deployed SimpleTeX hook where supported and still requires confidence review and manual correction.
- Semantic answer grouping needs `DEEPSEEK_API_KEY`; deterministic/manual grouping remains available without it.
- Provider-backed import results must always be owner-reviewed. Parser/OCR suggestions must not auto-publish or replace owner review.

## Intentionally V3 / future

- Guest SEB lockdown. Authenticated SEB can be used; no-login guest SEB remains blocked until server-verifiable evidence exists.
- Full Paper Mode automatic scan-to-student/question mapping.
- Full route-by-route institution role rollout across all authoring, publishing, marking, moderation, invigilation, export, analytics, and security data loaders. The role matrix, membership table, and navigation permission map exist, but every sensitive route must be staged with real collaborator accounts before this is production-ready.
- True offline-first file submission after browser/process termination.
- Advanced graphing, geometry, CAS, chemistry sketch, and STEM-specific in-exam tools.
- Official seeded standard trees for every curriculum.
- Full Moodle XML interoperability and lossless QTI round-tripping for unsupported item types.
- School-level dashboards across multiple workspaces.
- Historical rollback/diff UX beyond safe draft duplication/version protection.

## Feature readiness matrix

| Area | Current status | Production boundary |
| --- | --- | --- |
| Smart Import / Exam Compiler | Provider required unless DeepSeek and MinerU/OCR are configured | Manual PDF/LaTeX/JSON import, visual region repair, batch PDF preflight, sample-paper QA display, and owner review are production-safe. Provider-backed extraction needs live validation before high-stakes use. |
| AI/OCR Question Detection | Provider required | Do not claim automatic detection unless provider credentials exist and low-confidence review is tested. |
| Provider Dashboard / Import Job States | Ready | Owner Security page shows env/config readiness and recent import jobs without sending test payloads to providers. |
| OCR Cost / Quota / Import Audit Guardrails | Ready | Recent import metadata, sample QA status, batch import preflight, and audit logs are surfaced for owner review. Provider spending caps must still be configured in provider dashboards. |
| Deployment Readiness Console | Ready | Owner Security page shows env/config gates and manual validation requirements without mutating Supabase state. |
| Markscheme Mapping and Rubrics | Ready | Markscheme blocks and rubric points are editable; setup warnings show point-bank drift and `save-marking` rejects manual or summed rubric totals above the question maximum. |
| AI Answer Grouping | Manual fallback without DeepSeek | Deterministic/manual grouping covers typed normalization, numeric tolerance/unit grouping, blank buckets, table/manual-review, and whiteboard/manual-review responses. Semantic grouping is review-required and provider-gated. |
| Guest SEB / Lockdown | Blocked | Authenticated SEB can be used. Guest SEB remains blocked until BEK/CK/request-hash evidence can be server-verified safely. |
| Paper Mode | Manual fallback | Printable/scan workflows need OCR/barcode live validation for reliable auto-mapping; manual scan attachment and correction are the safe path. |
| STEM / Handwriting / Table OCR | Provider required | Needs Mathpix, MinerU, or equivalent OCR provider plus confidence review. Manual transcription remains the fallback. |
| Collaborative Grading Roles | Live validation required | Anonymous/double-marking policy, checked snapshot submission, moderation decisions, release gating, and marker assignment are deployed; multi-account workflow QA remains required. |
| Institution Role Matrix | Live validation required | `institution_memberships` RLS, role permissions, checked RPCs/actions, sensitive server layouts, and role-aware navigation are deployed. Real collaborator-account QA remains required. |
| Live Invigilation | Live validation required | Operationally useful surfaces exist; classroom-scale subscriptions, filters, and interventions need synthetic live QA. |
| Guest Upload Recovery | Ready | Upload signing, retries, byte verification, and idempotent finalization are server-enforced. |
| Offline Resilience | Manual fallback | Server autosave/retry plus attempt-token-bound local typed/table/whiteboard draft recovery exist. Full offline file submission after browser/process termination is not claimed. |
| Teacher Analytics | V2 ready, live validation recommended | Analytics now use real stored attempts, marks, question nodes, topic links, and rubric awards; school-scale exports still need live validation. |
| Question Library / Mock Generator | Live validation required | Extraction and generation require health-check review before generated exams are published. |
| Student Account Claim Flow | Live validation required | Expiring one-time codes, safe automatic matches, and owner review are deployed; duplicate and mismatched synthetic identity QA remains required. |
| Source PDF Health | Ready | Integrated into publish/health checks with weighted score breakdown and supporting-region warnings for diagrams, tables, and instructions. |
| Accommodations Matrix | Manual fallback | Extra time, upload extension, and server-controlled rest breaks are effective. Broader access-window, tool, visual, and TTS policies still need expansion/live validation. |
| Built-in Subject Tools | Manual fallback | Allowed materials, table responses, and simple whiteboard responses are safe. Advanced graphing/geometry/CAS tools must stay labelled unavailable unless integrated. |
| Curriculum Alignment | Manual fallback | Topic tags exist. Full standard trees need seeded IB/MYP/IGCSE/Olympiad content. |
| QTI / Moodle / XML | Manual fallback | Export Hub provides CSV/JSON handoffs and routes QTI to the existing assessment-scoped Edge export. Moodle XML remains unsupported with visible fidelity warnings. |
| Version History / Rollback | Manual fallback | Published versions are protected. Rollback should create/duplicate a new draft rather than mutating live attempts. |
| School-level Reporting | Manual fallback / live validation | Export Hub provides group/cohort CSV and analytics handoff JSON from owner-scoped data. Full school dashboards still need cross-workspace permission and export validation on the actual website. |
| Deployment Validation | Live validation required | Live migrations, Edge deployment, provider/core secret names, production aliases, headers, CORS, unauthenticated denial, and public route smoke checks passed on 2026-06-20. Authenticated multi-role workflow QA remains. |

## External providers and environment variables

Required for production core:

- `APP_ALLOWED_ORIGINS`
- `ATTEMPT_STATE_TOKEN_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` in server/Edge environments only

Required for provider-backed import/OCR/AI:

- `DEEPSEEK_API_KEY`
- `SIMPLETEX_APP_ID` and `SIMPLETEX_APP_SECRET`, or `MINERU_API_KEY` / a configured MinerU worker
- `MINERU_WORKER_HMAC_SECRET` when a MinerU worker callback is used

Operational setup outside the repo:

- Apply Supabase migrations to the actual Supabase project.
- Deploy Supabase Edge Functions after every Edge change.
- Keep Storage buckets private: `assessment-sources`, `assessment-packages`, `answer-uploads`, `marking-packets`.
- Configure DeepSeek/MinerU/Mathpix spend caps and provider alerting.
- Configure Supabase/Edge/WAF alerts for authentication failures, upload errors, rate-limit spikes, and Edge Function failures.

## Remaining limitations

- Guest SEB is intentionally blocked. Do not enable it for no-login exams until the server can verify URL-specific SEB evidence for a guest session.
- Automated Paper Mode scan-to-student/question matching is not production-complete without OCR/barcode live validation.
- Full offline submission is not claimed. Browser apps cannot safely retain selected local upload files after a process restart without user re-selection.
- Advanced STEM OCR, handwriting OCR, chemistry extraction, diagrams, and tables depend on external OCR provider quality and confidence review.
- Advanced graphing, geometry, CAS, and chemistry sketch tools are not production-ready; the current whiteboard is a simple manual drawing response, not a symbolic math or geometry engine.
- School-level dashboards and analytics require synthetic live records to verify aggregation, exports, and cross-workspace isolation.
- Curriculum standard trees need owner-approved seed data before they should be treated as official.

## Production deployment checklist

1. Run and record local checks: `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
2. Apply migrations to the actual Supabase project and confirm no failed statements.
3. Deploy all Supabase Edge Functions.
4. Set Edge secrets and provider keys.
5. Confirm private buckets cannot be read publicly.
6. Confirm no exam package releases before server state `ACTIVE`.
7. Confirm guest SEB-required sessions stay blocked.
8. Run a synthetic no-login exam:
   - teacher creates/imports an exam;
   - teacher uploads a source PDF and draws source regions;
   - teacher reviews questions, rubrics, and health checks;
   - teacher publishes an exam code;
   - guest student joins with exam code plus student number;
   - guest student answers/uploads/submits;
   - teacher monitors live roster and logs interventions;
   - teacher marks with rubric-click marking;
   - teacher releases feedback;
   - student views returned work/results where configured.
9. Run an authenticated student flow to verify existing student portals still work.
10. Run upload interruption, refresh, retry, and finalization retry cases.
11. Run owner-only access checks for question library, generated papers, health checks, support console, marking, and analytics.

## QA checklist

- PDF import without providers shows honest manual fallback.
- Batch PDF import identifies duplicate files, unsupported file types, large batches, and missing OCR provider setup before submission.
- Smart Import sample-paper QA fixtures are visible without marking provider-backed extraction as passed by default.
- PDF import with providers produces review-required suggestions, not auto-published questions.
- Low-confidence parser/OCR items appear in owner review.
- Health score breakdown identifies source coverage loss from unlinked question, diagram, table, and instruction regions.
- Markscheme instructions/cover pages are not mapped to Q1.
- Rubric-click awards recalculate question and attempt totals, and over-limit manual/rubric totals are rejected before saving.
- Deterministic answer grouping combines equivalent numeric answers with canonical units and leaves blanks/table/whiteboard groups for manual review.
- Guest upload confirmation rejects missing, empty, oversized, and non-PDF files.
- Extra time changes server-computed attempt state and student timer.
- Force-submit, pause/resume, and extra-time interventions write audit events.
- Student analytics and results show released data only.
- Private marker notes and unreleased annotations are not visible to students.

## Checks run

This section should be updated for each release candidate. For this readiness pass, these checks passed locally:

- `npm test -- tests/examsim-production-readiness-matrix.test.ts`
- `npm test -- tests/examsim-v3-provider-readiness.test.ts tests/examsim-production-readiness-matrix.test.ts`
- `npm test -- tests/student-delete-and-field-help.test.ts`
- `npm test -- tests/examsim-v3-deployment-readiness.test.ts`
- `npm test -- tests/examsim-v2-compiler-readiness.test.ts tests/examsim-v2-analytics.test.ts tests/examsim-production-readiness-matrix.test.ts`
- `npm test -- tests/examsim-v2-compiler-readiness.test.ts tests/pdf-region-editor-pipeline.test.ts`
- `npm test -- tests/rubric-readiness.test.ts tests/marking-scoring.test.ts tests/production-browser-mode.test.ts`
- `npm test -- tests/examsim-expansion.test.ts`
- `npm test -- tests/examsim-v3-response-capabilities.test.ts tests/examsim-v2-compiler-readiness.test.ts`
- `npm test -- tests/examsim-v3-export-hub.test.ts tests/sidebar-navigation.test.ts tests/examsim-production-readiness-matrix.test.ts`
- `npm test -- tests/examsim-v3-route-permissions.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run e2e`
- `npm run build`

Live verification on 2026-06-20:

- Reconciled and verified Supabase migration history, then applied migrations through `20260620084239`.
- Deployed 19 changed/new Edge Functions sequentially with JWT verification preserved.
- Confirmed new V3 tables/RPC privileges, including no anonymous execution for privileged institution functions and no direct authenticated update on marking snapshots.
- Confirmed production deployment `dpl_osDzL4LWuBEp4soF5Jd7QthTeNLM` is `READY` and aliased to `examvault.tutor-mcp.com`.
- Confirmed public `/`, `/exam`, and `/login` return successfully; unauthenticated owner routes redirect to login.
- Confirmed CSP, HSTS, private cache control, frame denial, content-type protection, referrer policy, and permissions policy headers.
- Confirmed the production origin receives Edge CORS permission, an arbitrary origin is denied, and unauthenticated SimpleTeX requests return `401`.
