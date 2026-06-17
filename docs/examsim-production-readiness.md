# Examsim Production Readiness

Last updated: 2026-06-17

This document records the current production boundary for the no-login Examsim workflow.

## Implemented In Code

- Guest exam-code entry, roster-first identity matching, guest access tokens, and server-signed state tokens.
- Guest package release through Edge Functions only, with SEB-required guest sessions blocked unless a server-verifiable secure-mode path is added.
- Guest PDF upload signing, private Storage upload, server-side PDF byte verification, locked upload slots, and finalization blocking for missing required uploads.
- Live extra-time intervention that mutates `attempts.end_at_utc` and `attempts.upload_deadline_at_utc`, with audit logging.
- Roster accommodation application for new guest attempts, including extra time and upload extension seconds/minutes/percent policy.
- Visual PDF source upload from the assessment authoring flow, private `assessment-sources` storage, `source_documents` creation, `source_pages` creation from PDF page metadata, and visual PDF.js page rendering.
- Visual source-region editor backed by `source_documents`, `source_pages`, and `question_source_regions`, with drawn/draggable/resizable normalized regions, split/merge/duplicate/delete controls, region inspector metadata, and question-card linking.
- Smart import fallback surfaces for MinerU/DeepSeek provider paths plus manual region repair when providers are unavailable.
- Examsim LaTeX split editor with deterministic preview for `\question`, `\answerbox`, and `\markscheme` syntax.
- Rubric templates, rubric point authoring, rubric-click marking, and per-rubric-item awards.
- Deterministic answer grouping for cross-student marking. Groups are review aids only; no automatic marks are applied.
- Live invigilation roster with current question, typed response count, upload progress, heartbeat gap, technical issue count, broadcast, private replies, extra time, pause/resume, and force-submit controls.

## External Setup Required

- Supabase migrations must be applied in the target environment.
- Supabase Edge Functions must be deployed after every Edge Function change.
- Required secrets must be set in Supabase Edge:
  - `APP_ALLOWED_ORIGINS`
  - `ATTEMPT_STATE_TOKEN_SECRET`
  - `MINERU_WORKER_HMAC_SECRET`
  - `DEEPSEEK_API_KEY` if AI parsing is enabled
  - `MINERU_API_KEY` or worker credentials if hosted OCR is enabled
- Private Storage buckets must remain private:
  - `assessment-sources`
  - `assessment-packages`
  - `answer-uploads`
  - `marking-packets`
- DeepSeek/MinerU provider spend caps and alerting must be configured outside the repo.
- A staging pass with synthetic owner/student/guest accounts is still required before production launch.

## Current Honest Limitations

- Guest SEB is intentionally blocked. Supporting it requires server-verifiable guest BEK/CK/request-hash evidence without weakening the authenticated SEB flow.
- Visual source-region editing now renders uploaded PDFs client-side with PDF.js when stored page preview images are unavailable. Server-side thumbnail generation and OCR text extraction still depend on the configured import/OCR pipeline or manual review.
- Paper Mode has schema foundations and manual fallback paths, but automated scan-to-student/question matching still requires staging calibration and/or OCR provider availability.
- Built-in tools are intentionally basic unless configured by assessment policy. Advanced graphing/geometry/CAS-style tools are not claimed complete.
- Offline uploads cannot be guaranteed after browser/process termination because selected local files cannot be securely retained by the web app without user re-selection.

## Production Launch Checklist

1. Apply migrations to staging.
2. Deploy all Supabase Edge Functions.
3. Confirm required Edge secrets and provider spend caps.
4. Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
5. Run a staging manual workflow:
   - teacher imports/creates exam;
   - teacher reviews visual regions and rubrics;
   - teacher publishes an exam session/code;
   - guest student joins with roster number;
   - guest uploads and finalizes;
   - owner monitors live roster and sends a private reply;
   - owner grants extra time and verifies student timer changes;
   - owner marks with rubric-click marking;
   - owner releases feedback;
   - student/guest result portal access is verified where configured.
6. Confirm no exam content is available before server state `ACTIVE`.
7. Confirm private files are only reachable through short-lived signed URLs.
