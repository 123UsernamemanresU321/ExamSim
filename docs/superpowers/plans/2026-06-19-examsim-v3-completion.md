# Examsim V3 Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every verified V3 product gap without weakening the existing authenticated or no-login exam workflows, and keep provider-gated or technically blocked capabilities explicitly non-ready.

**Architecture:** Build on the existing Next.js App Router, typed Supabase data layer, private Storage, and Edge Function security boundaries. Risky data/security packets are implemented sequentially with migrations, RLS, Edge validation, UI, and negative tests; provider-backed capabilities retain complete manual workflows and review gates.

**Tech Stack:** Next.js 15, React 19, TypeScript, Supabase Postgres/Auth/Storage/Edge Functions, Tailwind CSS, Vitest, Playwright.

---

## Worktree Classification

- **A - preserve:** the current dirty files replace obsolete staging language with live validation on the actual website and make email distribution optional. These changes are consistent with the owner decision and remain in place.
- **B - unrelated:** no unrelated dirty files were found in the initial status inspection.
- **C - resolve:** readiness currently treats SimpleTeX as absent; several V3 rows describe schema foundations as complete workflows. Those claims must be corrected as implementation proceeds.

## Packet Order And Verification

### Task 1: Secure student claim and identity reconciliation

**Files:**
- Create: `supabase/migrations/20260619_v3_student_claim_flow.sql`
- Create: `supabase/functions/_shared/attempt-claim.ts`
- Create: `supabase/functions/owner-issue-attempt-claim-code/index.ts`
- Create: `supabase/functions/claim-guest-attempt/index.ts`
- Create: `components/exam/student-attempt-claim-form.tsx`
- Modify: `app/exam/link-account/page.tsx`
- Modify: `app/owner/exam-sessions/[id]/reconcile/actions.ts`
- Modify: `app/owner/exam-sessions/[id]/reconcile/page.tsx`
- Modify: `types/database.ts`
- Test: `tests/examsim-v3-student-claim.test.ts`

- [ ] Write and run a failing test proving the current page is only a placeholder and no claim Edge boundary exists.
- [ ] Add expiring, one-time claim metadata with RLS kept closed to students and anonymous users.
- [ ] Add normalized claim-code generation/hash/decision helpers and behavioral tests.
- [ ] Add owner AAL2 issuance with ownership, released-feedback, audit, and rate-limit checks.
- [ ] Add authenticated-student redemption with exact roster/profile matching or owner-review fallback.
- [ ] Add owner approve/reject controls and student claim UI with loading/error/success states.
- [ ] Run focused tests, lint, and typecheck.

### Task 2: Accommodations and server timing

**Files:**
- Create: migration for accommodation policies and rest-break intervals
- Create: Edge functions for starting/ending controlled rest breaks
- Modify: shared attempt-state computation and guest/authenticated state endpoints
- Modify: owner live/session controls and student exam state UI
- Test: timing, access-window, upload-deadline, audit, and unauthorized-role cases

- [ ] Write failing tests for pause intervals extending effective deadlines exactly once.
- [ ] Add server-side interval and policy records with owner/workspace RLS.
- [ ] Recompute attempt state from intervals in every sensitive Edge path.
- [ ] Add matrix UI for timing, visual, materials, and tool policies.
- [ ] Keep TTS labelled unavailable unless a real provider is configured.

### Task 3: Institution route and data enforcement

**Files:**
- Modify: `app/owner/layout.tsx`, institution role helpers, owner data loaders, sensitive actions
- Add: permission-denied surface and route/data-loader regression tests

- [ ] Resolve the active institution membership server-side in the owner layout.
- [ ] Pass role/permissions to the shell and reject unauthorized data loaders/actions.
- [ ] Verify every owner route against the route permission map.
- [ ] Add cross-workspace denial tests for authoring, sessions, marking, exports, analytics, and security.

### Task 4: Collaborative marking and moderation

- [ ] Add independent marker submissions, reviewer decisions, adjudication, anonymous IDs, and identity-reveal audit.
- [ ] Add marker queues/workload and a release checklist that blocks unresolved moderation.
- [ ] Add keyboard-safe rubric actions, undo, recalculation, and consistency metrics.

### Task 5: Invigilation reliability

- [ ] Add idempotent event batches, receipt/acknowledgement state, alert thresholds, and incident timelines.
- [ ] Add live filters/risk summaries and classroom-scale synthetic tests.

### Task 6: Paper Mode

- [ ] Add private scan ingestion, printable identifiers, page mapping, confidence, manual correction, and audit.
- [ ] Integrate mapped pages into marking, feedback, analytics, and returned work.
- [ ] Keep automatic mapping provider-gated unless verified with real sample scans.

### Task 7: Import, OCR, authoring, and markscheme review

- [ ] Add SimpleTeX capability detection and server-only provider hook.
- [ ] Add provider probes, job audit/quota, batch import, fixtures, and honest fallback states.
- [ ] Complete confidence review, equation/table correction, linked assets, and side-by-side markscheme mapping.

### Task 8: Library, generator, standards, and analytics

- [ ] Add question provenance/duplicate handling and complete filters.
- [ ] Add blueprint/variant generation with health gates.
- [ ] Add workspace-scoped standards trees/import and real-data cohort/standards analytics.
- [ ] Add released-only student weakness/revision recommendations.

### Task 9: Governance and interoperability

- [ ] Add immutable snapshots, restore-as-draft, historical diff, and publish approvals.
- [ ] Add export jobs/history/permissions and conservative QTI/Moodle fidelity warnings.

### Task 10: Final review and validation

- [ ] Run Codex Security diff review on claims, roles, uploads, timing, and provider boundaries.
- [ ] Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run e2e`.
- [ ] Use Browser to verify local routes and the actual website with synthetic records where credentials permit.
- [ ] Update readiness code/docs only from verified evidence; keep guest SEB blocked without URL-specific request-hash evidence.

