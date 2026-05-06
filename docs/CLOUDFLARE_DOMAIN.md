# Cloudflare Domain Setup

Production domain: `examvault.tutor-mcp.com`.

## Vercel

1. Add the domain to the Vercel project:

```bash
npx vercel domains add examvault.tutor-mcp.com
```

2. Inspect the expected DNS target:

```bash
npx vercel domains inspect examvault.tutor-mcp.com
```

Vercel will show the required DNS target. Use that exact target in Cloudflare. For the current project inspection on
May 6, 2026, Vercel requested:

```text
A examvault.tutor-mcp.com 76.76.21.21
```

## Cloudflare DNS

Create the DNS record Vercel requests. Current required record:

```text
Type: A
Name: examvault
IPv4 address: 76.76.21.21
Proxy status: DNS only
TTL: Auto
```

If Vercel later requests a CNAME instead, use the Vercel-provided CNAME target exactly. Keep proxy status as **DNS only**
until Vercel verifies the domain and issues TLS. After the Vercel dashboard shows the domain as valid and HTTPS is
stable, Cloudflare proxying can be enabled if desired.

## Supabase Auth URLs

In Supabase Dashboard > Authentication > URL Configuration, include:

```text
Site URL: https://examvault.tutor-mcp.com
Redirect URLs:
https://examvault.tutor-mcp.com/**
https://exam-vault-zeta.vercel.app/**
http://localhost:3000/**
```

If preview deployments need auth redirects, add the exact Vercel preview URL pattern used by the project.
