# Cloudflare KMS Wrapper

Exam Vault uses this Cloudflare Worker as a first external KMS envelope-key wrapper.

Secrets:

```bash
wrangler secret put KMS_WRAPPING_KEY
wrangler secret put KMS_ADMIN_TOKEN
```

`KMS_WRAPPING_KEY` must be a base64-encoded 32-byte AES-GCM key.

Supabase Edge Function secrets:

```bash
EXTERNAL_KMS_PROVIDER=cloudflare
EXTERNAL_KMS_WRAP_URL=https://<worker>/wrap
EXTERNAL_KMS_UNWRAP_URL=https://<worker>/unwrap
EXTERNAL_KMS_ADMIN_TOKEN=<same admin token>
```

The worker returns only wrapped or unwrapped data keys to authorized server callers. Do not call it from browser code.
