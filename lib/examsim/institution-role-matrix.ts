export const INSTITUTION_ROLE_KEYS = [
  "owner_admin",
  "teacher",
  "marker",
  "reviewer",
  "invigilator",
  "read_only",
] as const;

export type InstitutionRole = (typeof INSTITUTION_ROLE_KEYS)[number];

export const INSTITUTION_PERMISSION_KEYS = [
  "assessment_authoring",
  "session_publishing",
  "marking",
  "moderation",
  "invigilation",
  "exports",
  "analytics",
  "student_data",
  "student_management",
  "readiness_security",
] as const;

export type InstitutionPermission = (typeof INSTITUTION_PERMISSION_KEYS)[number];

const ROLE_PERMISSIONS: Record<InstitutionRole, readonly InstitutionPermission[]> = {
  owner_admin: INSTITUTION_PERMISSION_KEYS,
  teacher: [
    "assessment_authoring",
    "session_publishing",
    "marking",
    "moderation",
    "invigilation",
    "exports",
    "analytics",
    "student_data",
    "student_management",
  ],
  marker: ["marking", "student_data"],
  reviewer: ["marking", "moderation", "analytics", "student_data"],
  invigilator: ["invigilation", "student_data"],
  read_only: ["analytics", "student_data"],
};

export const INSTITUTION_ROLE_LABELS: Record<InstitutionRole, string> = {
  owner_admin: "Owner / Admin",
  teacher: "Teacher",
  marker: "Marker",
  reviewer: "Reviewer",
  invigilator: "Invigilator",
  read_only: "Read-only viewer",
};

export const INSTITUTION_PERMISSION_LABELS: Record<InstitutionPermission, string> = {
  assessment_authoring: "Author exams",
  session_publishing: "Publish sessions",
  marking: "Mark work",
  moderation: "Moderate marks",
  invigilation: "Invigilate",
  exports: "Export data",
  analytics: "View analytics",
  student_data: "View student data",
  student_management: "Manage student roster",
  readiness_security: "Readiness and security",
};

export function permissionsForInstitutionRole(role: InstitutionRole): InstitutionPermission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function roleHasInstitutionPermission(role: InstitutionRole, permission: InstitutionPermission) {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function normalizeInstitutionRole(value: string | null | undefined): InstitutionRole | null {
  return INSTITUTION_ROLE_KEYS.find((role) => role === value) ?? null;
}
