import type { AppRole } from "@/lib/constants";

const STUDENT_ALIAS_DOMAIN = "students.local.exam-vault";

export function normalizeLoginIdentifier(value: string) {
  const identifier = value.trim();
  if (!identifier) return "";
  if (identifier.includes("@")) return identifier.toLowerCase();
  return `${identifier.toLowerCase()}@${STUDENT_ALIAS_DOMAIN}`;
}

export function isAppRole(value: unknown): value is AppRole {
  return value === "owner" || value === "student";
}
