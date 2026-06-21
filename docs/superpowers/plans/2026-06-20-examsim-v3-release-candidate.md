# Examsim V3 Release Candidate Delivery Plan

**Goal:** Close every remaining V3 acceptance gap from the attached product prompt while preserving current production-safe V2/V3 foundations and keeping provider-gated or technically blocked behavior honest.

**Architecture:** Continue with Next.js App Router, Supabase Postgres/Auth/Storage/Edge Functions, private signed files, server-computed attempt state, and review-required provider output. Sensitive database, token, permission, claim, marking-release, and live-attempt work is sequential. Isolated presentation, documentation, analytics display, and component-test work may run independently.

## Worktree Classification

- **Preserve:** all committed V2 and V3 foundations through the current `HEAD`, including guest delivery, upload/finalization safeguards, role foundations, claim flow, rest breaks, provider guardrails, readiness dashboards, and responsive security-page work.
- **Unrelated:** none in the clean starting worktree.
- **Resolve:** readiness overclaims configured providers as ready without successful sample validation; several V3 areas have foundations or manual fallbacks but not full verified workflows.

## Verifiable Packets

### 1. Readiness truth and evidence

- Add strict statuses: Ready, Provider Required, Manual Fallback, Blocked, Live Validation Required, Staging Required, V4/Future.
- Add route, test, migration, component, server-action, Edge-function, browser, seeded-QA, and provider-validation evidence to every feature.
- Never promote provider configuration to Ready without a successful reviewed sample run.
- Verify with focused Vitest, lint, and typecheck.

### 2. Institution permissions

- Audit every owner route and sensitive action against the server permission matrix.
- Close route, data-loader, server-action, and RLS gaps without broadening student access.
- Add denied-role and cross-workspace tests.

### 3. Import and visual authoring

- Complete provider probes, import lifecycle, sample QA, confidence review, source coverage, equation/table correction, batch import, and manual fallback.
- Keep raw JSON advanced-only and provider suggestions review-required.
- Verify PDF and LaTeX workflows with fixtures and browser QA.

### 4. Marking and moderation

- Complete anonymous marking, assignments, independent submissions, review/adjudication, release gates, deterministic/provider grouping, rubric totals, and consistency reporting.
- Add permission, total, audit, and released-visibility tests.

### 5. Live operations and accommodations

- Complete reliable invigilation events/chat/acknowledgement/timelines and server-side accommodations/rest-break behavior.
- Validate timing in every sensitive Edge path and with simulated classroom data.

### 6. Recovery, Paper Mode, and subject tools

- Complete signed-upload recovery, typed backup comparison, attempt inspection, practical print/scan/manual mapping, and supported tool policies.
- Keep true offline file submission and unintegrated advanced tools explicitly unavailable.

### 7. Library, standards, analytics, and revision

- Complete question provenance/duplicates/filtering, blueprint generation, standards import, scoped analytics, cohort reporting, and released-only revision suggestions.
- Validate stored-data calculations and workspace isolation.

### 8. Governance and interoperability

- Complete restore-as-draft, immutable published history, diff and approval UX, export history, conservative QTI, and explicit Moodle fidelity warnings.

### 9. Production verification and review

- Run live migration, private-bucket, Edge-function, provider-sample, and synthetic workflow checks against the actual website where credentials permit.
- Run security diff review and code review.
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run e2e`.
- Update readiness documentation only from verified evidence; guest SEB remains blocked unless URL-specific server-verifiable evidence is implemented.
