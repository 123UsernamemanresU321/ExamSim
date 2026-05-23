# Roadmap

## Phase 1: Browser Mode MVP

- Server-authoritative state machine.
- Private Storage buckets.
- RLS-protected metadata.
- Edge Function boundaries for sensitive workflows.
- JSON and deterministic LaTeX ingestion.
- PDF review-required stub plus MinerU parse job scaffolding.
- Owner dashboard, student dashboard, exam states, moderation report, and marking workspace.
- Production Browser Mode hardening: owner MFA, group assignments, one-PDF-per-slot uploads, audit logs, legal pages, and feedback release.

## Phase 2: Robust Parsing Worker

- Hosted MinerU API submission/polling is implemented as the primary low-maintenance PDF/OCR path.
- The RunPod-ready self-hosted MinerU worker remains an optional fallback, not the default.
- Add production monitoring, retry backoff, and cost controls for hosted parse jobs.
- PDF.js or PyMuPDF fallback page analysis.
- DeepSeek AI parse suggestions are implemented as review-required evidence only.

## Phase 3: SEB Secure Mode

- Validate Browser Exam Key and Config Key server-side. Implemented for package release.
- Block `seb_required` package release unless verification passes. Implemented.
- Document deployment-specific SEB configuration.

## Phase 4: Passkeys and MFA

- Owner MFA recovery/admin procedures and alerting.
- Optional student passkey enrollment after activation uses the current Supabase `auth.passkey` namespace when available,
  with alias/password fallback.
- Stronger recovery flows.

## Phase 5: QTI Import and Export

- Conservative QTI import and export are implemented.
- Improve QTI interaction mapping for rich item types and scoring metadata.
- Add fixture coverage from real IB/Olympiad-adjacent QTI packages.

## Phase 6: External KMS

- Cloudflare Worker KMS envelope wrapping is implemented for normalized package object writes and marking packet ZIPs.
- Key rotation and audit trails.

## Phase 7: AI-Assisted Marking

- Suggested rubric alignment and feedback drafts.
- Human-in-the-loop only.
- Never auto-accuse cheating from Browser Mode telemetry.

## Completed Advanced Learning Workflows

- Deterministic parser repair hardening for bad flat AI output.
- Root-question marking context architecture.
- Annotation Studio drag/autosave performance hardening.
- Paper Health Dashboard.
- Mistake Taxonomy.
- Question Bank extraction and Custom Paper Generator draft workflow.
- Student Correction / Resubmission Notebooks.

## Completed Student Experience Workflows

- Auth-aware public navigation for owner, student, guest, and incomplete-profile sessions.
- Student Command Center, Timeline with `.ics` export, readiness checks, server-time verification, device profiles,
  notifications, accessibility and low-bandwidth settings.
- Allowed Materials drawer, upload queue state, pre-finalization checklist, student incident reporting, recovery status,
  account security shortcuts, feedback inbox, archive, mistake pattern summary, comparison view, confidence tracker, and
  personal progress snapshot.

## Future Learning Improvements

- AI-assisted question bank tagging with owner confirmation.
- Advanced OCR region extraction for exact diagram crops.
- Longitudinal student progress history.
- Grade boundaries and grade descriptors.
- Examiner report linking.
- Full redo scheduling from correction notebooks and weak-topic recommendations.
- Mobile app wrapper.
- Native scanner integration.
- Offline-first typed answers.
- Passkeys as default student login once provider/browser support is stable.
