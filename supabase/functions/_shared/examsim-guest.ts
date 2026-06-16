import { getAdminClient } from "./supabase.ts";

const encoder = new TextEncoder();

export type GuestIdentityValidation =
  | {
      ok: true;
      studentName: string;
      studentNumber: string;
      classGroup: string | null;
    }
  | { ok: false; error: string };

export type VerifiedGuestAttempt = {
  tokenRow: {
    id: string;
    attempt_id: string;
    exam_session_id: string | null;
    expires_at: string;
    revoked_at: string | null;
  };
  attempt: Record<string, unknown> & { id: string; assessment_id: string; assessment_version_id: string };
};

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeExamCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export async function hashExamSecret(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(normalizeExamCode(value)));
  return toHex(digest);
}

export async function hashOpaqueToken(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toHex(digest);
}

export function generateGuestAccessToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function normalizeStudentNumber(value: string) {
  const compact = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = compact.match(/^([A-Z]{1,6}\d{0,2})(\d{3,4})$/);
  if (match) return `${match[1]}-${match[2]}`;
  return compact.replace(/^([A-Z]{1,6}\d{0,2})-?(\d{1,4})$/, "$1-$2");
}

export function validateGuestIdentity(input: {
  student_name?: string | null;
  student_number?: string | null;
  class_group?: string | null;
}): GuestIdentityValidation {
  const studentName = (input.student_name ?? "").trim().replace(/\s+/g, " ");
  const studentNumber = normalizeStudentNumber(input.student_number ?? "");
  const classGroup = (input.class_group ?? "").trim().replace(/\s+/g, " ") || null;

  if (studentName.length < 2 || studentName.length > 120) return { ok: false, error: "Enter your full name." };
  if (!/^[A-Z]{1,6}\d{0,2}-?\d{1,4}$/.test(studentNumber)) {
    return { ok: false, error: "Enter a valid student number." };
  }
  if (classGroup && classGroup.length > 60) return { ok: false, error: "Class or group is too long." };

  return { ok: true, studentName, studentNumber, classGroup };
}

export function publicSessionState(session: {
  status: string;
  open_at_utc: string;
  start_at_utc: string;
  close_at_utc: string;
}) {
  const now = Date.now();
  const openAt = Date.parse(session.open_at_utc);
  const startAt = Date.parse(session.start_at_utc);
  const closeAt = Date.parse(session.close_at_utc);
  if (!["published", "live"].includes(session.status)) return "invalid";
  if (!Number.isFinite(openAt) || !Number.isFinite(startAt) || !Number.isFinite(closeAt)) return "invalid";
  if (now < openAt) return "not_open";
  if (now > closeAt) return "closed";
  if (now < startAt) return "lobby";
  return "live";
}

export function getGuestTokenFromRequest(request: Request, body?: { guest_token?: string | null }) {
  const header = request.headers.get("x-exam-vault-guest-token");
  return (body?.guest_token || header || "").trim();
}

export async function verifyGuestAttemptToken(
  request: Request,
  body?: { guest_token?: string | null; attempt_id?: string | null },
): Promise<VerifiedGuestAttempt> {
  const token = getGuestTokenFromRequest(request, body);
  if (!token) throw new Error("Guest access token is required");
  const tokenHash = await hashOpaqueToken(token);
  const admin = getAdminClient();
  const { data: tokenRow, error: tokenError } = await admin
    .from("attempt_access_tokens")
    .select("id,attempt_id,exam_session_id,expires_at,revoked_at")
    .eq("token_hash", tokenHash)
    .eq("purpose", "guest_attempt")
    .maybeSingle();
  if (tokenError) throw tokenError;
  if (!tokenRow || tokenRow.revoked_at) throw new Error("Guest access token is invalid");
  if (Date.parse(tokenRow.expires_at) <= Date.now()) throw new Error("Guest access token expired");
  if (body?.attempt_id && tokenRow.attempt_id !== body.attempt_id) throw new Error("Guest access token does not match this attempt");

  const { data: attempt, error: attemptError } = await admin.from("attempts").select("*").eq("id", tokenRow.attempt_id).single();
  if (attemptError) throw attemptError;
  if (!attempt) throw new Error("Attempt not found");

  await admin.from("attempt_access_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenRow.id);
  return { tokenRow, attempt: attempt as VerifiedGuestAttempt["attempt"] };
}
