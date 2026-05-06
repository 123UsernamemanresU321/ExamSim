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
- Production Browser Mode hardening: owner MFA/AAL2 gates, group assignments, strict one-PDF-per-question uploads, marking/rubric scaffolding, feedback release, audit logs, passkey beta UI, legal pages, and MinerU worker scaffolding.

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
MINERU_WORKER_SECRET=
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

The hosted production database starts blank. Do not seed sample assessments into production; local/demo data lives only
behind `EXAM_VAULT_DEMO_MODE=1` or static export guards.

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
- Enforce owner MFA/AAL2 before student creation, group creation, publish/assignment, marking exports, and feedback release.
- Use private Storage and Edge Functions for all sensitive content and upload paths.
- Database backups do not automatically back up Supabase Storage objects. Back up Storage separately.
- Configure Supabase Auth Site URL and Redirect URLs for `https://exam-vault-zeta.vercel.app`,
  `https://examvault.tutor-mcp.com`, and local development URLs such as `http://localhost:3000`.

## Vercel

Vercel is the preferred production host for the full Next.js app. The linked Vercel project should use the normal
Next.js build, not the GitHub Pages static export path.

Build settings:

```bash
Install command: npm ci
Build command: npm run build
Output: .next
```

Set these Vercel environment variables for Production, Preview, and Development:

```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_DEFAULT_TIMEZONE
```

Do not set `NEXT_PUBLIC_DEPLOY_TARGET=github-pages` or `NEXT_PUBLIC_STATIC_EXPORT=1` on Vercel. Keep
`SUPABASE_SERVICE_ROLE_KEY`, `OWNER_EMAIL`, and `ATTEMPT_STATE_TOKEN_SECRET` out of Vercel unless a future Vercel-side
server workflow explicitly requires them. The current sensitive workflows run in Supabase Edge Functions, where those
server-side secrets belong.

Custom domain target: `examvault.tutor-mcp.com`. See [docs/CLOUDFLARE_DOMAIN.md](docs/CLOUDFLARE_DOMAIN.md) for the
Cloudflare CNAME and TLS verification steps.

## Production Browser Mode Notes

- Upload slots accept exactly one PDF, max 10MB. Successful upload or blank submission locks the slot.
- Students are owner-managed, 13+ only, and use login alias plus password by default. Passkeys are optional beta after activation.
- PDF/OCR parsing is asynchronous draft evidence. The self-hosted MinerU worker writes artifacts to private Storage, and owner review remains mandatory before publish.
- Feedback is hidden until the owner explicitly releases it.

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
