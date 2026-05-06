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

- External parse queue.
- Self-hosted MinerU worker deployment and monitoring.
- PDF.js or PyMuPDF fallback page analysis.
- AI fallback only after deterministic parsing, with owner review required.

## Phase 3: SEB Secure Mode

- Validate Browser Exam Key and Config Key server-side.
- Block `seb_required` package release unless verification passes.
- Document deployment-specific SEB configuration.

## Phase 4: Passkeys and MFA

- Owner MFA recovery/admin procedures and alerting.
- Optional student passkey enrollment after activation, kept beta until the Supabase passkey API is stable.
- Stronger recovery flows.

## Phase 5: QTI Import and Export

- Map normalized JSON nodes to QTI concepts.
- Import QTI packages into draft assessment versions.
- Export published versions for external systems.

## Phase 6: External KMS

- Envelope encryption for assessment packages and marking packets.
- Key rotation and audit trails.

## Phase 7: AI-Assisted Marking

- Suggested rubric alignment and feedback drafts.
- Human-in-the-loop only.
- Never auto-accuse cheating from Browser Mode telemetry.
