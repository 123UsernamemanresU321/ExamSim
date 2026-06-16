export type ExamSessionAccessStatus = "invalid" | "not_open" | "lobby" | "live" | "closed";

export type GuestIdentityInput = {
  studentName?: string | null;
  studentNumber?: string | null;
  classGroup?: string | null;
};

export type GuestIdentityValidation =
  | {
      ok: true;
      studentName: string;
      studentNumber: string;
      classGroup: string | null;
    }
  | {
      ok: false;
      error: string;
    };

const MAX_NAME_LENGTH = 120;
const MAX_CLASS_GROUP_LENGTH = 60;
const STUDENT_NUMBER_PATTERN = /^[A-Z]{1,6}\d{0,2}-?\d{1,4}$/;

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
  const normalized = normalizeExamCode(value);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return toHex(digest);
}

export function generateReadableExamCode(prefix = "EXAM") {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const suffix = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
  return normalizeExamCode(`${prefix}-${suffix.slice(0, 3)}-${suffix.slice(3)}`);
}

export function normalizeStudentNumber(value: string) {
  const compact = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = compact.match(/^([A-Z]{1,6}\d{0,2})(\d{3,4})$/);
  if (match) return `${match[1]}-${match[2]}`;
  return compact.replace(/^([A-Z]{1,6}\d{0,2})-?(\d{1,4})$/, "$1-$2");
}

export function buildStudentNumber(prefix: string, ordinal: number) {
  const cleanPrefix = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const padded = String(Math.max(0, Math.floor(ordinal))).padStart(3, "0");
  if (/^[A-Z]\d*$/.test(cleanPrefix) && cleanPrefix.length <= 2) return `${cleanPrefix}${padded}`;
  return `${cleanPrefix}-${padded}`;
}

export function validateGuestIdentity(input: GuestIdentityInput): GuestIdentityValidation {
  const studentName = (input.studentName ?? "").trim().replace(/\s+/g, " ");
  const studentNumber = normalizeStudentNumber(input.studentNumber ?? "");
  const classGroup = (input.classGroup ?? "").trim().replace(/\s+/g, " ") || null;

  if (studentName.length < 2 || studentName.length > MAX_NAME_LENGTH) {
    return { ok: false, error: "Enter your full name as instructed." };
  }

  if (!STUDENT_NUMBER_PATTERN.test(studentNumber)) {
    return { ok: false, error: "Enter a valid student number, for example DP1-007 or E001." };
  }

  if (classGroup && classGroup.length > MAX_CLASS_GROUP_LENGTH) {
    return { ok: false, error: "Class or group is too long." };
  }

  return {
    ok: true,
    studentName,
    studentNumber,
    classGroup,
  };
}

export function classifyExamSessionAccess(
  session: {
    status: string;
    openAtUtc: string;
    startAtUtc: string;
    closeAtUtc: string;
  },
  now = new Date(),
): ExamSessionAccessStatus {
  if (!["published", "live"].includes(session.status)) return "invalid";
  const openAt = new Date(session.openAtUtc).getTime();
  const startAt = new Date(session.startAtUtc).getTime();
  const closeAt = new Date(session.closeAtUtc).getTime();
  const current = now.getTime();

  if (!Number.isFinite(openAt) || !Number.isFinite(startAt) || !Number.isFinite(closeAt)) return "invalid";
  if (current < openAt) return "not_open";
  if (current > closeAt) return "closed";
  if (current < startAt) return "lobby";
  return "live";
}
