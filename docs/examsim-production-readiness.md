# Examsim Production Readiness

Last updated: 2026-06-23

This document records the current production boundary for Examsim. It is intentionally strict: provider-dependent OCR, AI, lockdown, offline, and scan-mapping features must be shown as provider-gated, blocked, manual fallback, or live-validation-required until they are verified end to end on the actual website with synthetic records.

The owner Security page renders this same readiness model through `ExamsimProductionReadinessPanel` and the
configuration-only `ProviderReadinessDashboard`. The dashboard does not send prompts, PDFs, or student data to external
providers; it only reports env/config readiness, recent import-job states, and manual fallback paths.

## Actual-site provider QA on 2026-06-22

The supplied IB Mathematics: Analysis and Approaches HL Paper 2 fixture was exercised against the actual Supabase project
with synthetic accounts and private Storage. The synthetic assessment remains `review_required`, its governance state is
`draft`, `published_at` is null, and no provider output was published automatically.

- Eight synthetic accounts exist: owner, teacher, marker, reviewer, invigilator, read-only viewer, and two students. Their
  credentials are stored only in ignored local `.qa-accounts.local.json` with mode `0600`.
- Hosted MinerU extracted 12/12 top-level questions, 110/110 marks, the Q1-Q9/Q10-Q12 section boundary, and all supplied
  visual/table prompt checks from the private paper artifact.
- SimpleTeX general OCR produced a 704-character review-required handwriting result at confidence `0.3247`. The result is
  deliberately not approved automatically because the confidence is low.
- Automatic question source regions remain 0 and teacher-confirmed answer types are incomplete. The PDF fixture therefore
  remains `needs_review` despite correct question and mark extraction.
- Automatic markscheme-to-rubric mapping remains 0/12. No rubric or mark allocation was applied automatically.
- DeepSeek returned HTTP 402 insufficient balance. The application recorded `insufficient_balance` and retained the
  deterministic/manual review path. Funding the provider account is still required before DeepSeek-backed QA can pass.
- Enforced June synthetic-owner usage after QA is DeepSeek 1/20 reserved USD, MinerU 51/200 pages, and SimpleTeX 7/200
  pages. The repeated SimpleTeX calls exposed by this run led to restricting generic transport retries to idempotent HTTP
  methods so an ambiguous POST timeout cannot duplicate a provider action.

This evidence validates the provider boundaries and fallbacks, not full automatic Smart Import. Source-region review,
answer-type confirmation, markscheme mapping, and owner approval remain mandatory before publishing.

DeepSeek cost controls now disable thinking mode for parser and semantic-grouping requests, cap parser output at 24,000
tokens, bound each source/markscheme context segment, avoid sending the existing package twice, and record the applied
limits and context sizes with successful parse jobs. `DEEPSEEK_OWNER_MONTHLY_USD_LIMIT` is denominated in US dollars and is
an application reservation ceiling, not a provider-side CNY billing limit.

## Private IB resource and curriculum import on 2026-06-23

Migrations `20260622191934_v3_exam_resources_curriculum.sql` through
`20260623090000_fix_resource_manager_rls.sql` and `20260623123258_fix_curriculum_review_atomicity.sql` are applied to the actual Supabase project, and the affected resource,
curriculum, policy, guest-session, package, and public guest Edge Functions are deployed. The owner-scoped private import
completed with:

- five active reusable resources: Mathematics AA HL and SL formula booklets, Chemistry and Physics data booklets, and the
  Business Management formulae booklet;
- fourteen guide-backed frameworks covering eleven school DP subjects plus CAS, Extended Essay, and TOK;
- all guide-derived nodes kept in `draft` / `needs_review`, with source-page provenance, so they cannot affect authoring,
  analytics, mock generation, or revision before owner approval;
- PDF MIME, magic bytes, size, page count, SHA-256, owner scope, and private object paths validated before database rows
  were created;
- no supplied IB PDF copied into Git or a public asset directory.

The assessment policy is now canonical and version-frozen. Sessions may tighten it but cannot remove required materials
or permit prohibited tools. Required and allowed private resources are delivered through short-lived signed URLs from
authenticated or guest Edge boundaries; prohibited session resources are filtered before signing, archived resource
versions remain available to already-published attempts, object paths are never returned as a student storage grant, and
exam-code sessions reject mutable assessment versions.

## Production-ready V1 core

- Exam-code entry and no-login guest sitting through Edge/server validation.
- Roster-first guest identity matching with clear exam code vs student number separation.
- Guest access tokens and server-signed attempt state tokens.
- Server-authoritative exam timing, upload windows, package release, finalization, and sensitive state transitions.
- Guest package release through Edge Functions only.
- Guest SEB-required sessions fail closed. A guest-bound URL-specific BEK/CK evidence path exists, but
  `GUEST_SEB_ENABLED` must remain unset until a real Safe Exam Browser client and final `.seb` file pass actual-site QA.
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
- Simple whiteboard response workspace for sketch/drawing answers. Strokes are saved as normalized coordinates so they survive viewport changes.
- Teacher-controlled subject tools: browser read-aloud through the Browser Web Speech API, sandbox-isolated Desmos graphing through the official keyed embed, sandbox-isolated GeoGebra geometry with CAS disabled, and a self-hosted Ketcher chemistry editor. All are disabled by default in the server-issued session policy.
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
- Published assessment versions are immutable. Historical versions can be compared and restored only by cloning a complete, separately audited draft, including questions, source documents/pages/regions, markscheme mappings, rubrics, topics, and standards.
- Paper Mode generates stable roster booklets and paper attempts, printable PDF packs, private verified scan uploads, audited manual page-to-student/question mapping, and mapped scan links in digital marking. Automatic OCR/barcode mapping remains optional and provider-gated.
- Live invigilation now includes searchable risk filters, heartbeat/visibility evidence, private and broadcast messages, student acknowledgements, and acknowledgement counts for owner review.
- The accommodations matrix includes server-enforced extra time, upload extensions, custom access windows, capped server-side rest breaks, display preferences, calculator/formula policies, allowed materials, and teacher-approved subject tools. Browser TTS support and installed voices vary by student device.
- Question Library extraction preserves response interactions, source regions, topics, standards, rubrics, provenance, readiness, and duplicate fingerprints. Blueprint generation supports topic, standard, difficulty, command-term, paper-type, recent-use exclusions, replacement, readiness scoring, and conversion to an editable assessment.
- Owner-managed curriculum frameworks and hierarchical standards include reviewable starter structures for IB, MYP, IGCSE, and Olympiad/SAMO-style use. They feed question links, standards mastery, cohort reporting, and revision recommendations without claiming official completeness.
- Adaptive revision sets use released marks only, match weaknesses to reviewed Question Library items, remain teacher-editable drafts until assignment, and expose assigned content through a student-checked database projection rather than direct Question Library access.
- Group/cohort reporting uses owner-scoped attempts and marks for completion, marking completion, average score, support flags, topic mastery, standards mastery, paper comparison, CSV, and PDF output.
- Export governance records download history. CSV/JSON/PDF exports are permission-checked; QTI and conservative Moodle XML are AAL2-gated and carry explicit fidelity warnings.
- Private resource library and immutable assessment policy support required/allowed/prohibited booklets, physical
  calculator classes including required GDC, Browser TTS, Desmos, GeoGebra, Ketcher, and approved materials. Authenticated
  and guest workspaces receive a safe policy summary and fetch resources separately through checked signed-URL endpoints.
- Private curriculum guide import stores authorized PDFs in `curriculum-sources`, creates review-gated concise nodes with
  source-page provenance, and excludes drafts from authoring and reporting until approval.

## Owner-facing readiness evidence

| Surface | Evidence | Production boundary |
| --- | --- | --- |
| Provider status dashboard | `components/owner/provider-readiness-dashboard.tsx`, `app/owner/security/page.tsx` | Configuration-only checks. It does not call external providers or expose server-only secrets to the browser. |
| Import job state, sample QA, and governance model | `lib/examsim/provider-readiness.ts`, `components/owner/provider-readiness-dashboard.tsx`, `tests/examsim-v3-provider-readiness.test.ts` | Uses existing `parse_jobs` and `owner_audit_logs`; no new table is required for V3 status, sample QA fixture display, batch PDF preflight, quota, retry, cost, and audit display. |
| Deployment readiness console | `components/owner/deployment-readiness-console.tsx`, `lib/examsim/deployment-readiness.ts`, `tests/examsim-v3-deployment-readiness.test.ts` | Read-only launch checklist. Live RLS/storage/migration validation should run on the actual website and Supabase project with synthetic records. |
| Institution role matrix | `lib/examsim/institution-role-matrix.ts`, `lib/examsim/institution-roles.ts`, `lib/examsim/institution-route-access.ts`, `components/owner/institution-role-matrix-panel.tsx`, `components/owner/sidebar-nav.tsx`, `supabase/migrations/20260618140348_institution_role_matrix.sql`, `supabase/migrations/20260619000400_v3_institution_permission_rollout.sql`, `tests/examsim-v3-institution-roles.test.ts`, `tests/examsim-v3-route-permissions.test.ts` | Owner-scoped collaboration membership, server/RLS permission enforcement, role-aware navigation, and sensitive route layouts are deployed. Multi-account workflow QA remains required before institution-wide use. |
| V3 release-candidate schema | Migrations `20260619000100` through `20260621171549`; claim, OCR, state, upload, invigilation, Paper Mode, revision, analytics, export, security-closure, and student-group RLS functions | Applied to the actual Supabase project. The security-closure migration adds tenant-bound revision/Paper Mode references, atomic accommodation updates, safe student revision projection, and cross-reference triggers. The latest migration removes recursive student-group policy evaluation without widening group access. |
| Release-candidate readiness | `lib/examsim-production-readiness.ts`, `components/owner/examsim-production-readiness-panel.tsx`, `tests/examsim-production-readiness-matrix.test.ts` | Explicitly states whether full V3 can be claimed. Current status remains not full V3 ready while blocked, provider-gated, live-validation-required, and manual-fallback items remain. |
| Export Hub | `app/owner/export-hub/page.tsx`, `lib/examsim/export-hub.ts`, `supabase/migrations/20260621093000_v3_export_governance.sql`, `tests/examsim-v3-export-governance.test.ts` | Audited owner-scoped CSV/JSON/PDF exports. QTI and conservative Moodle XML remain AAL2 assessment-scoped and visibly warn about lossy interactions. |
| Paper Mode | `app/owner/paper-mode`, `app/api/owner/paper-mode/[jobId]/booklet/route.ts`, `supabase/migrations/20260621082532_v3_paper_mode.sql`, `tests/examsim-v3-paper-mode.test.ts` | Manual mapping is production-safe. Automated OCR/barcode mapping is not claimed without provider validation. |
| Curriculum and cohort analytics | `app/owner/standards`, `app/owner/analytics/cohorts`, `lib/examsim/cohort-analytics.ts`, `tests/examsim-v3-standards-analytics.test.ts`, `tests/examsim-v3-cohort-reporting.test.ts` | Real-data owner-scoped reporting is implemented; cross-account isolation and representative datasets still require actual-site QA. |
| Private exam resources and policy | `app/owner/resources`, `app/owner/assessments/[id]/settings`, `components/exam/exam-policy-summary.tsx`, migrations `20260622191934`, `20260623083500`, and `20260623090000`, `tests/examsim-v3-resource-policy-ux.test.ts`, `tests/examsim-v3-resource-delivery.test.ts` | Resources remain private and owner-scoped; assignment policy is frozen with the version; sessions may tighten only; prohibited resources are not signed; authorized workspace managers can archive without changing immutable provenance. |
| Guide-derived curriculum review | `app/owner/standards`, `components/owner/curriculum-guide-review-panel.tsx`, `scripts/import-private-ib-content.mjs`, `tests/examsim-v3-curriculum-guide-import.test.ts`, `tests/examsim-v3-private-ib-import.test.ts` | Five booklets and fourteen guide-backed frameworks are imported privately. Draft nodes remain excluded until owner approval. |
| Adaptive revision | `app/owner/revision`, `app/student/revision`, `supabase/migrations/20260621091000_v3_adaptive_revision.sql`, `tests/examsim-v3-adaptive-revision.test.ts` | Only visible, non-revoked released feedback feeds generation. Assignment is teacher-reviewed and student-scoped. |
| Compiler review queue | `lib/examsim/compiler-readiness.ts`, `app/owner/assessments/[id]/compiler/page.tsx` | Low-confidence and missing-data items stay review-required before publish. |
| Source coverage score | `lib/paper-health.ts`, `app/owner/assessments/[id]/health/page.tsx`, `tests/examsim-v2-compiler-readiness.test.ts`, `tests/pdf-region-editor-pipeline.test.ts` | Weighted health score and category breakdown for structure, source, markscheme, delivery, marking, and security. It flags unlinked question and supporting regions without touching Storage or publish logic. |
| Rubric total validator | `lib/examsim/rubric-readiness.ts`, `app/owner/assessments/[id]/rubrics/page.tsx`, `components/owner/marking-response-workspace.tsx`, `supabase/functions/save-marking/index.ts`, `tests/rubric-readiness.test.ts`, `tests/marking-scoring.test.ts`, `tests/production-browser-mode.test.ts` | Owners see point-bank totals and question-maximum warnings before marking; the Edge save boundary rejects manual and summed rubric totals above the question maximum. |
| Field help hydration fix | `components/form-field-help-runtime.tsx`, `tests/student-delete-and-field-help.test.ts` | Tooltips are added client-side only after load so React hydration does not see unexpected attributes. |

## Release-candidate readiness

The owner Security page includes a `Release candidate readiness` summary derived from the same matrix. The migrations,
changed Edge Functions, and web release are live on the actual project. It remains **not full V3 ready** until actual-site
multi-role and synthetic classroom QA, configured OCR/AI review completion, and the intentional limitations below are
resolved or accepted. Guest SEB remains fail-closed behind its feature gate and true process-restart file submission
remains explicitly best-effort.

## Provider-gated V2 features

- Provider-backed Smart Import / Exam Compiler needs `DEEPSEEK_API_KEY` plus SimpleTeX APP credentials or `MINERU_API_KEY`.
- AI/OCR question-region detection has live SimpleTeX and MinerU configuration but still requires reviewed sample-paper validation. Manual PDF regions remain the production fallback.
- STEM/handwriting/table/diagram OCR uses the deployed SimpleTeX hook where supported and still requires confidence review and manual correction.
- Semantic answer grouping needs `DEEPSEEK_API_KEY`; deterministic/manual grouping remains available without it.
- Provider-backed import results must always be owner-reviewed. Parser/OCR suggestions must not auto-publish or replace owner review.

## Intentionally V3 / future

- Guest SEB lockdown. The server evidence path is implemented but intentionally disabled. Authenticated SEB remains the
  supported path until `GUEST_SEB_ENABLED=true` is justified by a real production URL, final `.seb` file, and Safe Exam
  Browser client test.
- Automatic Paper Mode OCR/barcode scan mapping. The complete manual path is implemented.
- Multi-account actual-site validation for teacher, marker, reviewer, invigilator, and read-only roles.
- True offline-first file submission after browser/process termination.
- Advanced CAS and specialist STEM engines beyond the approved Desmos graphing, GeoGebra geometry, Ketcher chemistry, table, and whiteboard tools.
- Official complete standard trees for every curriculum. Owner-managed trees and starter samples are implemented.
- Lossless Moodle/QTI round-tripping for interactions those standards cannot represent. Conservative exports are implemented with warnings.

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
| Guest SEB / Lockdown | Blocked pending device QA | Guest-bound URL-specific BEK/CK evidence, freshness checks, and package gating are implemented, but `GUEST_SEB_ENABLED` stays unset until a real client/final `.seb` test passes. |
| Paper Mode | Ready manual production path | Personalized booklet PDF, private scan upload, PDF byte verification, page records, audited manual mapping, marking links, and normal release/analytics integration are implemented. Automatic OCR/barcode mapping remains provider-gated. |
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
| Accommodations Matrix | Live validation required | Extra time, upload extension, access windows, server-controlled rest breaks, visual preferences, tools/materials, and audit evidence are implemented. Browser speech and approved subject tools still require device/browser QA. |
| Built-in Subject Tools and Exam Resources | Live validation required | Browser TTS, Desmos, GeoGebra, Ketcher, structured responses, physical calculator rules, and private required/allowed booklets are version-policy gated. Sessions cannot weaken the assessment policy. Device and actual-site signed-resource QA remain. |
| Curriculum Alignment | Ready owner-managed path | Hierarchical standards, private source guides, review gating, topic/standard links, and analytics are implemented. Fourteen guide-backed frameworks are draft until owner approval and are not represented as official complete curricula. |
| Adaptive Revision | Ready | Released evidence produces teacher-reviewed drafts; assigned content is student-scoped and does not expose Question Library rows directly. |
| QTI / Moodle / XML | Live validation required | Audited QTI and conservative Moodle XML exports are implemented. Unsupported interactions are visibly warned and Moodle uses review-required essay fallback. |
| Version History / Rollback | Live validation required | Published versions are protected, field/source diffs are visible, and rollback clones a complete new draft without mutating live attempts. |
| School-level Reporting | Live validation required | Owner-scoped group dashboards, topic/standards mastery, completion/support metrics, CSV, and PDF are implemented. Actual-site cross-workspace QA remains. |
| Deployment Validation | Live validation required | Live migrations through `20260623123258`, affected Edge Functions, and production deployment `dpl_H8BJiV9Bz9Gt5iumpWKXbxVRYMcz` are live. The anonymous Paper Mode RPC grant is revoked; private resource policy/trigger checks pass. Authenticated multi-role, classroom-scale, guest-SEB device, and cross-workspace workflow QA remain. |

## External providers and environment variables

Required for production core:

- `APP_ALLOWED_ORIGINS`
- `ATTEMPT_STATE_TOKEN_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` in Supabase Edge and the Vercel server environment only. Vercel needs it for owner-managed Supabase Auth user deletion; it must never use a `NEXT_PUBLIC_` name.

Required for provider-backed import/OCR/AI:

- `DEEPSEEK_API_KEY`
- `SIMPLETEX_APP_ID` and `SIMPLETEX_APP_SECRET`, or `MINERU_API_KEY` / a configured MinerU worker
- `MINERU_WORKER_HMAC_SECRET` when a MinerU worker callback is used
- `DEEPSEEK_OWNER_MONTHLY_USD_LIMIT=20`
- `DEEPSEEK_PARSE_RESERVATION_USD=1`
- `DEEPSEEK_GROUPING_RESERVATION_USD=0.1`
- `AI_PARSE_MAX_OUTPUT_TOKENS=24000` (hard-capped at 24,000 by server code)
- `MINERU_OWNER_MONTHLY_PAGE_LIMIT=200`
- `SIMPLETEX_OWNER_MONTHLY_PAGE_LIMIT=200`

Required only after guest SEB real-client QA passes:

- `GUEST_SEB_ENABLED=true`. Leave unset or false before the final production URL and `.seb` configuration are verified.

Required only when Desmos is enabled for an exam:

- `NEXT_PUBLIC_DESMOS_API_KEY` in the Vercel/Next.js production environment. This is a public embed key, not a server secret.

Operational setup outside the repo:

- Apply Supabase migrations to the actual Supabase project.
- Deploy Supabase Edge Functions after every Edge change.
- Keep Storage buckets private: `assessment-sources`, `assessment-resources`, `curriculum-sources`,
  `assessment-packages`, `answer-uploads`, `marking-packets`, and `paper-scans`.
- Configure DeepSeek, MinerU, and SimpleTeX balance/quota alerts in their provider dashboards. Application quotas do not
  replace provider billing controls.
- Configure Supabase/Edge/WAF alerts for authentication failures, upload errors, rate-limit spikes, and Edge Function failures.

## Remaining limitations

- Guest SEB is intentionally disabled even though the evidence path exists. Do not set `GUEST_SEB_ENABLED=true` until a
  real client verifies the final production URL, BEK/CK request hashes, evidence expiry, and package release.
- Automated Paper Mode scan-to-student/question matching is not claimed without OCR/barcode validation; audited manual mapping is the production path.
- Full offline submission is not claimed. Browser apps cannot safely retain selected local upload files after a process restart without user re-selection.
- Advanced STEM OCR, handwriting OCR, chemistry extraction, diagrams, and tables depend on external OCR provider quality and confidence review.
- Browser speech voices differ by browser and operating system, and some browsers may obtain voices through their own online service. Validate the actual student devices before relying on TTS as a formal accommodation.
- Desmos and GeoGebra require internet access. Ketcher is bundled locally. CAS remains unavailable and must not be described as an approved built-in tool.
- Group/school dashboards require synthetic actual-site records to verify aggregation, exports, and cross-workspace isolation before institution-wide use.
- The fourteen imported guide-derived frameworks are private draft content. They require owner review and approval before
  use and must not be described as official or exhaustive curriculum trees.

## Production deployment checklist

1. Run and record local checks: `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
2. Apply migrations to the actual Supabase project and confirm no failed statements.
3. Deploy all Supabase Edge Functions.
4. Set Edge secrets and provider keys.
5. Confirm private buckets cannot be read publicly.
6. Confirm no exam package releases before server state `ACTIVE`.
7. Confirm guest SEB-required sessions stay blocked while `GUEST_SEB_ENABLED` is unset; separately run real-client QA
   before any later enablement.
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

- `npx vitest run tests/simpletex-response.test.ts tests/network-retry.test.ts tests/examsim-live-paper-qa.test.ts tests/examsim-provider-monthly-quotas.test.ts tests/examsim-v3-provider-readiness.test.ts tests/security-remediation.test.ts` - 45 tests passed before the POST retry regression was added.
- `npx vitest run tests/network-retry.test.ts` - 5 tests passed, including no automatic retry for ambiguous POST failures.
- `supabase db query --linked` - confirmed reviewed QA evidence, quota counters, redacted OCR metadata, and an unpublished `review_required` synthetic version on the actual project.
- `npm run lint` - passed.
- `npm run typecheck` - passed.
- `npm test` - 83 files and 499 tests passed.
- `npm run build` - passed with 62 static pages generated.
- `supabase db push --dry-run` and `supabase db push` - migration
  `20260622191934_v3_exam_resources_curriculum.sql` applied to the actual project.
- `supabase db push` - migration `20260623082000_fix_paper_mode_booklet_rpc_privileges.sql` applied; live privilege
  verification reports `anon_execute=false`, `authenticated_execute=true`, and `service_execute=true` for the Paper Mode
  booklet generator.
- `supabase db push` - owner-scope migrations `20260623083500_enforce_private_resource_owner_scope.sql` and
  `20260623090000_fix_resource_manager_rls.sql` applied. Read-only live validation confirms both resource buckets private,
  four scope triggers active, operation-specific resource/curriculum RLS present, and no anonymous execution of the scope
  trigger functions.
- `supabase db push` - `20260623123258_fix_curriculum_review_atomicity.sql` applied after production review exposed a
  legacy owner-scoped path mismatch. The migration preserves immutable legacy PDF provenance on status-only updates,
  keeps new uploads on canonical paths, atomically applies review decisions, and reconciled all 14 affected guide sources
  to `ready`. The review RPC is denied to `anon`, permission-checked for authenticated users, and idempotent on retries.
- `npx vercel --prod --yes` - production deployment `dpl_H8BJiV9Bz9Gt5iumpWKXbxVRYMcz` completed and was aliased to
  `https://examvault.tutor-mcp.com`. Authenticated Browser verification loaded `/owner/standards` without console errors,
  and the post-deploy production 500 log query returned no events.
- Affected resource, curriculum, policy, guest-session, package, and public guest Edge Functions deployed to the actual
  project with intended public-function JWT settings.
- `npm run import:ib-private` - imported five active private resources and fourteen review-gated guide frameworks for the
  authorized owner; no PDFs were added to Git/public assets.
- Focused resource/curriculum/demo-mode tests passed, and Browser verification confirmed intentional empty states at
  `/owner/resources` and `/owner/standards` in local demo mode.
- `npx vercel --prod --yes` - production deployment `dpl_BsNxjxcdv3tckHHHzf8mSmJ9kUQN` completed and aliased to
  `https://examvault.tutor-mcp.com`; the one-hour post-deploy Vercel error scan returned no errors.
- Actual-site Browser QA - public `/exam`, synthetic-owner `/owner/resources`, `/owner/standards`, and `/owner/security`
  rendered without server or browser console errors; the Security page reported no horizontal document overflow. Live
  database verification confirmed 5 active resources, 14 private draft frameworks, 14 private source guides, 0
  prematurely approved guide nodes, and both new buckets private.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run e2e` passed for this release candidate;
  the full suite contains 83 test files / 499 tests, the build emits 62 static pages, and Playwright passed 9/9 workflows.
- Supabase security advisors show the known internally authorized `SECURITY DEFINER` RPC warnings plus unavailable leaked
  password protection on the current plan; no new anonymous resource-policy or trigger-function grant was introduced.
- `supabase db lint --linked --level warning --fail-on error` reports two `plpgsql_check` false positives for temporary
  mapping tables created inside `replace_question_tree_for_version` and `clone_assessment_version_content_as_draft`.
  Both RPCs executed successfully in explicit rolled-back transactions on the actual project, and live privilege checks
  confirm neither RPC is executable by `anon` or `authenticated` directly.
- The Codex Security plugin could not start because its bundled Python 3.12 dynamic library was unavailable. A direct
  diff-scoped review was completed instead; formal plugin-generated scan artifacts remain unavailable for this run.

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

Security closure verification on 2026-06-21:

- `npm test -- tests/examsim-v3-security-closure.test.ts tests/examsim-html-sanitization.test.ts`
- `npm test` - 67 files and 428 tests passed.
- `npm run typecheck`
- `npm audit` - zero known vulnerabilities after upgrading Next.js to 16.2.9 and enforcing PostCSS 8.5.14.
- `supabase db push --dry-run`
- `supabase db push` - applied through `20260621171549_fix_student_group_rls_recursion.sql`.
- Redeployed the ten security-affected Edge Functions, including attempt state/package, intervention, student results, upload analysis, Paper Mode confirmation, OCR review, and Moodle export.

Earlier live verification on 2026-06-20:

- Reconciled and verified Supabase migration history, then applied migrations through `20260620084239`.
- Deployed 19 changed/new Edge Functions sequentially with JWT verification preserved.
- Confirmed new V3 tables/RPC privileges, including no anonymous execution for privileged institution functions and no direct authenticated update on marking snapshots.
- Confirmed production deployment `dpl_osDzL4LWuBEp4soF5Jd7QthTeNLM` is `READY` and aliased to `examvault.tutor-mcp.com`.
- Confirmed public `/`, `/exam`, and `/login` return successfully; unauthenticated owner routes redirect to login.
- Confirmed CSP, HSTS, private cache control, frame denial, content-type protection, referrer policy, and permissions policy headers.
- Confirmed the production origin receives Edge CORS permission, an arbitrary origin is denied, and unauthenticated SimpleTeX requests return `401`.
