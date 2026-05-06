# Exam Vault

Exam Vault is a production-minded MVP for secure exam simulation. It uses Next.js App Router for the web app and Supabase for Auth, Postgres, Row Level Security, private Storage, Edge Functions, Realtime-ready metadata, and SQL migrations.

Browser Mode is tamper-evident, not tamper-proof. The browser records moderation signals and displays timers, but server code decides attempt state, content release, upload acceptance, and finalization.

## What Is Included

- Owner and student app shells following the Figma academic interface direction.
- Public landing, login, student activation, owner dashboard, student dashboard, assessment creation, parse review, publish, waiting, active exam, upload-only, finished review, moderation report, and marking workspace routes.
- Supabase SQL migration with tables, constraints, indexes, helper functions, and RLS policies.
- Supabase Edge Function implementations/stubs for sensitive workflows.
- Zod schemas for normalized assessment packages and Edge payload boundaries.
- Unit tests for attempt state, countdown target, package validation, upload slot uniqueness, and moderation aggregation.
- Playwright scaffold for the critical owner/student flows.

## Environment Variables

Client-visible:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_DEFAULT_TIMEZONE=Africa/Johannesburg
```

Server-only:

```bash
SUPABASE_SERVICE_ROLE_KEY=
OWNER_EMAIL=
ATTEMPT_STATE_TOKEN_SECRET=
```

Optional future integrations:

```bash
OCR_WORKER_URL=
AI_PARSE_PROVIDER=
AI_PARSE_API_KEY=
SMTP_HOST=
SMTP_USER=
SMTP_PASS=
EXTERNAL_KMS_KEY_ID=
```

Never expose `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_EMAIL`, or `ATTEMPT_STATE_TOKEN_SECRET` to client code.

## Local Setup

```bash
npm install
npm run dev
```

Supabase local setup:

```bash
supabase start
supabase db reset
supabase functions serve
```

Apply migrations in hosted Supabase with your normal deployment pipeline, for example:

```bash
supabase link --project-ref kpnviarxgslwwcrzrgpo
supabase db push
supabase functions deploy
```

Provision the configured owner after migrations are applied:

```bash
npm run provision:owner
```

The script reads `.env.local`, creates or updates the `OWNER_EMAIL` auth user with `app_metadata.app_role = owner`,
upserts the matching `profiles` and `owner_settings` rows, and writes a local ignored
`.owner-bootstrap.local.txt` file containing the temporary password. Change that password after first login.

Private buckets expected by the app:

- `assessment-sources`
- `assessment-packages`
- `answer-uploads`
- `marking-packets`

Create them as private buckets. Do not use public URLs for real assessment material.

## Verification Commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Playwright:

```bash
npm run e2e
```

Playwright starts the app with `EXAM_VAULT_DEMO_MODE=1` so protected demo screens remain testable without a real
Supabase session. Production never honors this bypass.

## Deployment Notes

- Configure `OWNER_EMAIL` server-side and seed the owner profile/app metadata intentionally.
- Enforce owner MFA/AAL2 before production publish and assignment workflows.
- Use private Storage and Edge Functions for all sensitive content and upload paths.
- Database backups do not automatically back up Supabase Storage objects. Back up Storage separately.

## GitHub Pages

GitHub Pages is static hosting, so it cannot run Next.js API routes, proxy middleware, server actions, or server-side
route guards. Exam Vault supports this by using Supabase Auth, RLS, and Edge Functions as the runtime backend from the
browser. Sensitive content remains gated by Supabase Edge Functions; the static frontend is not trusted for timing or
authorization.

The workflow at `.github/workflows/deploy-pages.yml` builds with:

```bash
npm run build:pages
```

Add these GitHub repository secrets:

```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Then enable Pages in GitHub repository settings with source `GitHub Actions`.

The static export pre-generates the demo dynamic routes used by smoke tests. Newly created live assessment/attempt IDs
are still protected by Supabase, but static hosting cannot SSR arbitrary new dynamic paths. For broad production use on
GitHub Pages, prefer query-based client routes for new IDs or deploy the same app to a server-capable host.
