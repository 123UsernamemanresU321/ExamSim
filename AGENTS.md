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
- Keep `DEEPSEEK_API_KEY`, Cloudflare KMS secrets, and RunPod worker secrets server-only.
- Do not use SEB user-agent strings as proof of secure mode; validate Browser Exam Key and Config Key hashes.
- Keep QTI import conservative and review-required when mappings are uncertain.
