# Agent Instructions

Future coding agents working on Exam Vault must:

- Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` before claiming completion.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_EMAIL`, `ATTEMPT_STATE_TOKEN_SECRET`, or any server-only secret to client code.
- Do not weaken RLS policies or add broad student `SELECT` access to `assessment_versions` or `question_nodes`.
- Do not preload exam content before `ACTIVE`.
- Do not implement client-only timers or client-only state transitions.
- Keep Browser Mode language honest: tamper-evident, not tamper-proof.
- Use Edge Functions or server code for sensitive actions.
- Recompute attempt state server-side in every sensitive workflow.
- Keep Supabase Storage buckets private.
- Update documentation after schema, Edge Function, or security boundary changes.
- Do not use `EXAM_VAULT_DEMO_MODE=1` outside local testing; production route guards must remain fail-closed.
- Do not let AI parse suggestions publish or replace owner review automatically.
- Keep `DEEPSEEK_API_KEY`, `MINERU_API_KEY`, Cloudflare KMS secrets, and optional RunPod worker secrets server-only.
- Do not send PDFs to hosted MinerU from browser code; all hosted MinerU calls must go through Edge Functions.
- Do not use SEB user-agent strings as proof of secure mode; validate URL-specific Browser Exam Key and Config Key request hashes.
- Keep QTI import conservative and review-required when mappings are uncertain.
- Do not trust AI parser output directly; always pass parser output through the deterministic hierarchy repair and validation layer.
- Do not reintroduce Annotation Studio autosave or parent JSON updates on pointer-move/drag frames; commit annotation changes on drag end.
- Do not expose private marker notes, unreleased mistake instances, question bank data, generated paper criteria, paper health checks, or unreleased correction feedback to students.
- Do not make client clock or readiness checks authoritative; student countdown, finalization, upload, and content release flows must keep using server-computed attempt state.
- Do not expose student data across accounts in command center, feedback inbox, archive, progress, device, notification, recovery, or confidence routes.
- Keep student upload queue changes tied to root-question upload slots; subquestions get marks and feedback, not separate upload/annotation ownership.
- Keep owner bulk operations, marker assignments, and saved operational views behind owner-only RLS and server actions; do not expose operations board or support console metadata to students.
- Keep student flag notes routed through the checked `set-question-flag` Edge Function; do not store them as client-only exam state.
- Keep the no-login `/exam` flow Edge-mediated. Guest exam codes and guest access tokens must be hashed at rest, guests must not query sensitive tables directly, and package release/autosave/finalization must keep recomputing server-side attempt state.
- Do not enable `seb_required` package release for guest attempts unless a server-verifiable SEB session evidence path exists; use the authenticated student SEB flow for secure-browser sittings.
