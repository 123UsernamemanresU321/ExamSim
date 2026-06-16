import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { corsHeadersFor, isCorsOriginAllowed, statusForError } from "../supabase/functions/_shared/http";
import {
  assertPdfUploadBytes,
  estimatePdfPageCount,
  hasPdfMagicBytes,
  MAX_STUDENT_UPLOAD_BYTES,
} from "../supabase/functions/_shared/pdf-upload";
import { verifyWebhookSignatureParts } from "../supabase/functions/_shared/webhook-signature";

function read(path: string) {
  return readFileSync(path, "utf8");
}

async function hmacSha256Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("security report remediation", () => {
  it("authorizes owner source signed URLs with exact path lookups only", () => {
    const source = read("supabase/functions/owner-sign-storage-url/index.ts");
    expect(source).toContain('.eq("source_object_path", objectPath)');
    expect(source).toContain('.eq("markscheme_source_object_path", objectPath)');
    expect(source).not.toContain(".or(`");
    expect(source).not.toContain(".or(");
  });

  it("confirms student uploads from server-verified PDF bytes, not client metadata", () => {
    const source = read("supabase/functions/confirm-upload-slot/index.ts");
    expect(source).toContain("verifyAnswerUploadPdf");
    expect(source).toContain("file_size_bytes: verified.byteLength");
    expect(source).toContain("content_type: verified.contentType");
    expect(source).not.toContain("file_size_bytes: body.file_size_bytes");
    expect(source).not.toContain("content_type: body.content_type");
  });

  it("validates PDF magic bytes and size before accepting uploads", () => {
    const valid = new TextEncoder().encode("%PDF-1.7\n1 0 obj<< /Type /Pages /Count 2 >>endobj\n2 0 obj<< /Type /Page >>endobj");
    expect(hasPdfMagicBytes(valid)).toBe(true);
    expect(() => assertPdfUploadBytes(valid)).not.toThrow();
    expect(estimatePdfPageCount(valid)).toBe(2);

    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    expect(hasPdfMagicBytes(html)).toBe(false);
    expect(() => assertPdfUploadBytes(html)).toThrow(/not a valid PDF/i);

    expect(() => assertPdfUploadBytes(new Uint8Array())).toThrow(/empty/i);
    const tooLarge = new Uint8Array(MAX_STUDENT_UPLOAD_BYTES + 1);
    tooLarge.set(new TextEncoder().encode("%PDF-1.7"));
    expect(() => assertPdfUploadBytes(tooLarge)).toThrow(/10MB/i);
  });

  it("uses exact-origin CORS and never falls back to wildcard origins", () => {
    const allowed = new Request("https://edge.example.test", {
      headers: { origin: "https://examvault.tutor-mcp.com" },
    });
    const denied = new Request("https://edge.example.test", {
      headers: { origin: "https://evil.example" },
    });
    expect(isCorsOriginAllowed(allowed)).toBe(true);
    expect(corsHeadersFor(allowed)["Access-Control-Allow-Origin"]).toBe("https://examvault.tutor-mcp.com");
    expect(isCorsOriginAllowed(denied)).toBe(false);
    expect(corsHeadersFor(denied)["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(JSON.stringify(corsHeadersFor(allowed))).not.toContain('"*"');
    expect(read("supabase/functions/_shared/http.ts")).not.toContain('"Access-Control-Allow-Origin": "*"');
  });

  it("adds production browser security headers and private authenticated cache rules", () => {
    const source = read("next.config.ts");
    expect(source).toContain("Content-Security-Policy");
    expect(source).toContain("Strict-Transport-Security");
    expect(source).toContain("frame-ancestors 'none'");
    expect(source).toContain("object-src 'none'");
    expect(source).toContain("/owner/:path*");
    expect(source).toContain("/student/:path*");
    expect(source).toContain("private, no-store");
  });

  it("adds private rate-limit and callback tables with no client RLS policies", () => {
    const migration = read("supabase/migrations/20260615152427_security_report_remediation.sql");
    expect(migration).toContain("create extension if not exists pgcrypto with schema extensions");
    expect(migration).toContain("create table if not exists public.edge_rate_limits");
    expect(migration).toContain("alter table public.edge_rate_limits enable row level security");
    expect(migration).toContain("revoke all on table public.edge_rate_limits from anon, authenticated");
    expect(migration).toContain("create or replace function public.consume_edge_rate_limit");
    expect(migration).toContain("set search_path = public, extensions");
    expect(migration).toContain("digest(p_key::text, 'sha256'::text)");
    expect(migration).toContain("grant execute on function public.consume_edge_rate_limit");
    expect(migration).toContain("create table if not exists public.parse_worker_callbacks");
    expect(migration).toContain("alter table public.parse_worker_callbacks enable row level security");
    expect(migration).not.toContain("create policy");
  });

  it("ships a repair migration for hosted projects with pgcrypto outside public search path", () => {
    const migration = read("supabase/migrations/20260616192951_fix_rate_limit_pgcrypto_search_path.sql");
    expect(migration).toContain("create extension if not exists pgcrypto with schema extensions");
    expect(migration).toContain("create or replace function public.consume_edge_rate_limit");
    expect(migration).toContain("set search_path = public, extensions");
    expect(migration).toContain("digest(p_key::text, 'sha256'::text)");
  });

  it("wires rate limits into activation and provider-cost endpoints", () => {
    expect(read("supabase/functions/activate-student/index.ts")).toContain("activate-student:login-code");
    expect(read("supabase/functions/activate-student/index.ts")).toContain("Invalid or expired activation details");
    const aiParse = read("supabase/functions/ai-parse-assessment/index.ts");
    expect(aiParse).toContain("ai-parse-assessment:owner");
    expect(aiParse).toContain("isMissingRateLimitBoundary");
    expect(aiParse).toContain("function digest");
    expect(aiParse).toContain("AI parse rate-limit database migration is not deployed");
    expect(read("supabase/functions/mineru-submit-hosted-job/index.ts")).toContain("mineru-submit-hosted-job:owner");
    expect(read("supabase/functions/mineru-poll-hosted-job/index.ts")).toContain("mineru-poll-hosted-job:owner");
    expect(statusForError("Rate limit exceeded. Try again later.")).toBe(429);
  });

  it("returns actionable AI parse errors instead of opaque 500s", () => {
    const aiParse = read("supabase/functions/ai-parse-assessment/index.ts");
    expect(aiParse).toContain("DeepSeek AI parse is not configured");
    expect(aiParse).toContain("}, 503)");
    expect(aiParse).toContain('status: "failed"');
    expect(aiParse).toContain("error_message: safeErrorMessage");
    expect(aiParse).toContain('.eq("status", "running")');
    expect(statusForError("AI response failed backend validation:\n- Q6 latex prompt suspiciously short.")).toBe(422);
    expect(statusForError("DeepSeek did not return message content")).toBe(422);
  });

  it("verifies MinerU worker HMAC signatures and rejects stale or invalid callbacks", async () => {
    const secret = "worker-secret";
    const timestamp = "1770000000";
    const deliveryId = "delivery-1";
    const rawBody = JSON.stringify({ parse_job_id: "job", ok: true });
    const signature = await hmacSha256Hex(secret, `${timestamp}.${deliveryId}.${rawBody}`);

    await expect(verifyWebhookSignatureParts({
      secret,
      rawBody,
      timestamp,
      deliveryId,
      signature: `sha256=${signature}`,
      nowMs: Number(timestamp) * 1000 + 1000,
      toleranceSeconds: 300,
    })).resolves.toBeUndefined();

    await expect(verifyWebhookSignatureParts({
      secret,
      rawBody,
      timestamp,
      deliveryId,
      signature: "sha256=bad",
      nowMs: Number(timestamp) * 1000 + 1000,
      toleranceSeconds: 300,
    })).rejects.toThrow(/invalid/i);

    await expect(verifyWebhookSignatureParts({
      secret,
      rawBody,
      timestamp,
      deliveryId,
      signature,
      nowMs: Number(timestamp) * 1000 + 600_000,
      toleranceSeconds: 300,
    })).rejects.toThrow(/expired/i);
  });

  it("guards parser worker callbacks against replay and finalized job mutation", () => {
    const source = read("supabase/functions/complete-parse-job/index.ts");
    expect(source).toContain("verifyMineruWorkerRequest");
    expect(source).toContain("parse_worker_callbacks");
    expect(source).toContain("duplicate: true");
    expect(source).toContain('.in("status", ["queued", "running"])');
    expect(source).toContain("parse_job_already_finalized");
    expect(read("supabase/functions/_shared/webhook-signature.ts")).toContain("EXAM_VAULT_ALLOW_LEGACY_WORKER_SECRET");
  });
});
