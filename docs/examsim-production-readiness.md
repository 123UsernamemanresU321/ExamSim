# Examsim Production Readiness

Last updated: 2026-06-17

This document records the current production boundary for Examsim. It is intentionally strict: provider-dependent OCR, AI, lockdown, offline, and scan-mapping features must be shown as provider-gated, blocked, manual fallback, or staging-required until they are verified end to end.

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
- Source PDF health checks for missing source regions, unlinked regions, overlapping boxes, low-confidence unreviewed regions, missing marks/response types, unresolved markscheme mappings, and compiler review items.
- LaTeX split editor and deterministic Examsim syntax parsing for questions, answer boxes, and markscheme blocks.
- Markscheme mapping, rubric templates, rubric point authoring, rubric-click marking, and per-rubric-item awards.
- Deterministic/manual answer grouping as a review aid. Marks are never applied automatically without teacher review.
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
- Deployment readiness console lists core env vars, Supabase migrations, RLS, private storage, Edge Functions, provider setup, seed accounts, and security-claim checks with ready/blocked/manual-validation states.
- Owner Export Hub provides owner-only CSV/JSON handoff exports for markbooks, roster reconciliation, groups/cohorts, assessment inventory, and analytics validation. It keeps QTI assessment-scoped through the existing Edge export and labels Moodle XML unsupported until fidelity warnings are validated.
- Hydration-safe form-field help runtime now waits until after browser load before adding tooltip attributes to inputs, preventing server/client attribute mismatches.

## Owner-facing readiness evidence

| Surface | Evidence | Production boundary |
| --- | --- | --- |
| Provider status dashboard | `components/owner/provider-readiness-dashboard.tsx`, `app/owner/security/page.tsx` | Configuration-only checks. It does not call external providers or expose server-only secrets to the browser. |
| Import job state and governance model | `lib/examsim/provider-readiness.ts`, `tests/examsim-v3-provider-readiness.test.ts` | Uses existing `parse_jobs` and `owner_audit_logs`; no new table is required for V3 status, quota, retry, cost, and audit display. |
| Deployment readiness console | `components/owner/deployment-readiness-console.tsx`, `lib/examsim/deployment-readiness.ts`, `tests/examsim-v3-deployment-readiness.test.ts` | Read-only launch checklist. Live RLS/storage/migration validation still belongs in staging/provider tooling. |
| Export Hub | `app/owner/export-hub/page.tsx`, `lib/examsim/export-hub.ts`, `tests/examsim-v3-export-hub.test.ts` | Owner-scoped CSV/JSON handoff exports. QTI remains AAL2 Edge-scoped per assessment; Moodle XML remains visibly unsupported. |
| Compiler review queue | `lib/examsim/compiler-readiness.ts`, `app/owner/assessments/[id]/compiler/page.tsx` | Low-confidence and missing-data items stay review-required before publish. |
| Field help hydration fix | `components/form-field-help-runtime.tsx`, `tests/student-delete-and-field-help.test.ts` | Tooltips are added client-side only after load so React hydration does not see unexpected attributes. |

## Provider-gated V2 features

- Provider-backed Smart Import / Exam Compiler needs `DEEPSEEK_API_KEY` plus `MINERU_API_KEY` or `MINERU_WORKER_HMAC_SECRET`.
- AI/OCR question-region detection needs MinerU/OCR setup and staging validation. Without it, manual PDF regions are the production path.
- STEM/handwriting/table/diagram OCR needs Mathpix, MinerU, or another capable OCR provider plus confidence review.
- Semantic answer grouping needs `DEEPSEEK_API_KEY`; deterministic/manual grouping remains available without it.
- Provider-backed import results must always be owner-reviewed. Parser/OCR suggestions must not auto-publish or replace owner review.

## Intentionally V3 / future

- Guest SEB lockdown. Authenticated SEB can be used; no-login guest SEB remains blocked until server-verifiable evidence exists.
- Full Paper Mode automatic scan-to-student/question mapping.
- Full institution role matrix across owner/admin, teacher, marker, reviewer, invigilator, and read-only viewer.
- True offline-first file submission after browser/process termination.
- Advanced graphing, geometry, CAS, chemistry sketch, and STEM-specific in-exam tools.
- Official seeded standard trees for every curriculum.
- Full Moodle XML interoperability and lossless QTI round-tripping for unsupported item types.
- School-level dashboards across multiple workspaces.
- Historical rollback/diff UX beyond safe draft duplication/version protection.

## Feature readiness matrix

| Area | Current status | Production boundary |
| --- | --- | --- |
| Smart Import / Exam Compiler | Provider required unless DeepSeek and MinerU/OCR are configured | Manual PDF/LaTeX/JSON import, visual region repair, and owner review are production-safe. Provider-backed extraction needs staging before launch. |
| AI/OCR Question Detection | Provider required | Do not claim automatic detection unless provider credentials exist and low-confidence review is tested. |
| Provider Dashboard / Import Job States | Ready | Owner Security page shows env/config readiness and recent import jobs without sending test payloads to providers. |
| OCR Cost / Quota / Import Audit Guardrails | Ready | Recent import metadata and audit logs are surfaced for owner review. Provider spending caps must still be configured in provider dashboards. |
| Deployment Readiness Console | Ready | Owner Security page shows env/config gates and manual validation requirements without mutating Supabase state. |
| Markscheme Mapping and Rubrics | Ready | Markscheme blocks and rubric points are editable; totals must still be checked during QA. |
| AI Answer Grouping | Manual fallback without DeepSeek | Deterministic/manual grouping is safe; semantic grouping is review-required and provider-gated. |
| Guest SEB / Lockdown | Blocked | Authenticated SEB can be used. Guest SEB remains blocked until BEK/CK/request-hash evidence can be server-verified safely. |
| Paper Mode | Manual fallback | Printable/scan workflows need OCR/barcode staging for reliable auto-mapping; manual scan attachment and correction are the safe path. |
| STEM / Handwriting / Table OCR | Provider required | Needs Mathpix, MinerU, or equivalent OCR provider plus confidence review. Manual transcription remains the fallback. |
| Collaborative Grading Roles | Manual fallback / staging | Owner-led marker assignment and review flags are available; institution-grade role separation needs real-account staging. |
| Live Invigilation | Staging required | Operationally useful surfaces exist; classroom-scale subscriptions, filters, and interventions need synthetic load QA. |
| Guest Upload Recovery | Ready | Upload signing, retries, byte verification, and idempotent finalization are server-enforced. |
| Offline Resilience | Manual fallback | Typed autosave/retry and recovery states exist. Full offline file submission after browser/process termination is not claimed. |
| Teacher Analytics | V2 ready, staging recommended | Analytics now use real stored attempts, marks, question nodes, topic links, and rubric awards; school-scale exports still need staging. |
| Question Library / Mock Generator | Staging required | Extraction and generation require health-check review before generated exams are published. |
| Student Account Claim Flow | Staging required | Claim/reconciliation paths must be tested with duplicate and mismatched identities. |
| Source PDF Health | Ready | Integrated into publish/health checks. |
| Accommodations Matrix | Manual fallback | Extra time and upload extension are server-effective. Broader rest-break/tool/TTS policies need staging. |
| Built-in Subject Tools | Manual fallback | Allowed materials, table responses, and simple whiteboard responses are safe. Advanced graphing/geometry/CAS tools must stay labelled unavailable unless integrated. |
| Curriculum Alignment | Manual fallback | Topic tags exist. Full standard trees need seeded IB/MYP/IGCSE/Olympiad content. |
| QTI / Moodle / XML | Manual fallback | Export Hub provides CSV/JSON handoffs and routes QTI to the existing assessment-scoped Edge export. Moodle XML remains unsupported with visible fidelity warnings. |
| Version History / Rollback | Manual fallback | Published versions are protected. Rollback should create/duplicate a new draft rather than mutating live attempts. |
| School-level Reporting | Manual fallback / staging | Export Hub provides group/cohort CSV and analytics handoff JSON from owner-scoped data. Full school dashboards still need cross-workspace permission and export validation. |
| Deployment Validation | Staging required | Migrations, Edge deployment, secrets, private buckets, and manual QA must pass in staging. |

## External providers and environment variables

Required for production core:

- `APP_ALLOWED_ORIGINS`
- `ATTEMPT_STATE_TOKEN_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` in server/Edge environments only

Required for provider-backed import/OCR/AI:

- `DEEPSEEK_API_KEY`
- `MINERU_API_KEY` or a configured MinerU worker
- `MINERU_WORKER_HMAC_SECRET`
- Optional `MATHPIX_API_KEY` or equivalent STEM OCR provider

Operational setup outside the repo:

- Apply Supabase migrations in staging and production.
- Deploy Supabase Edge Functions after every Edge change.
- Keep Storage buckets private: `assessment-sources`, `assessment-packages`, `answer-uploads`, `marking-packets`.
- Configure DeepSeek/MinerU/Mathpix spend caps and provider alerting.
- Configure Supabase/Edge/WAF alerts for authentication failures, upload errors, rate-limit spikes, and Edge Function failures.

## Remaining limitations

- Guest SEB is intentionally blocked. Do not enable it for no-login exams until the server can verify URL-specific SEB evidence for a guest session.
- Automated Paper Mode scan-to-student/question matching is not production-complete without OCR/barcode staging.
- Full offline submission is not claimed. Browser apps cannot safely retain selected local upload files after a process restart without user re-selection.
- Advanced STEM OCR, handwriting OCR, chemistry extraction, diagrams, and tables depend on external OCR provider quality and confidence review.
- Advanced graphing, geometry, CAS, and chemistry sketch tools are not production-ready; the current whiteboard is a simple manual drawing response, not a symbolic math or geometry engine.
- School-level dashboards and analytics require staging data to verify aggregation, exports, and cross-workspace isolation.
- Curriculum standard trees need owner-approved seed data before they should be treated as official.

## Production deployment checklist

1. Run and record local checks: `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
2. Apply migrations to staging and confirm no failed statements.
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
- PDF import with providers produces review-required suggestions, not auto-published questions.
- Low-confidence parser/OCR items appear in owner review.
- Markscheme instructions/cover pages are not mapped to Q1.
- Rubric-click awards recalculate question and attempt totals.
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
- `npm test -- tests/examsim-v3-response-capabilities.test.ts tests/examsim-v2-compiler-readiness.test.ts`
- `npm test -- tests/examsim-v3-export-hub.test.ts tests/sidebar-navigation.test.ts tests/examsim-production-readiness-matrix.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run e2e`
- `npm run build`
