import type { InstitutionPermission } from "@/lib/examsim/institution-role-matrix";

type RoutePermissionRule = {
  permission: InstitutionPermission;
  matches: (pathname: string) => boolean;
};

const OWNER_ROUTE_PERMISSION_RULES: RoutePermissionRule[] = [
  { permission: "readiness_security", matches: (path) => path === "/owner/security" || path.startsWith("/owner/security/") },
  { permission: "exports", matches: (path) => path === "/owner/export-hub" || path.startsWith("/owner/export-hub/") },
  { permission: "invigilation", matches: (path) => path === "/owner/operations" || path.startsWith("/owner/operations/") },
  { permission: "invigilation", matches: (path) => /^\/owner\/exam-sessions\/[^/]+\/live(?:\/|$)/.test(path) },
  { permission: "student_management", matches: (path) => /^\/owner\/exam-sessions\/[^/]+\/reconcile(?:\/|$)/.test(path) },
  { permission: "session_publishing", matches: (path) => path === "/owner/exam-sessions" || path.startsWith("/owner/exam-sessions/") },
  { permission: "marking", matches: (path) => /^\/owner\/assessments\/[^/]+\/cross-mark(?:\/|$)/.test(path) },
  { permission: "moderation", matches: (path) => /^\/owner\/assessments\/[^/]+\/approval(?:\/|$)/.test(path) },
  { permission: "marking", matches: (path) => /^\/owner\/attempts\/[^/]+\/mark(?:\/|$)/.test(path) },
  { permission: "marking", matches: (path) => /^\/owner\/attempts\/[^/]+\/corrections(?:\/|$)/.test(path) },
  { permission: "marking", matches: (path) => path === "/owner/paper-mode" || path.startsWith("/owner/paper-mode/") },
  { permission: "student_data", matches: (path) => path === "/owner/attempts" || path.startsWith("/owner/attempts/") },
  { permission: "moderation", matches: (path) => path === "/owner/marking-queue/moderation" || path.startsWith("/owner/marking-queue/moderation/") },
  { permission: "moderation", matches: (path) => path === "/owner/marking-queue/workload" || path.startsWith("/owner/marking-queue/workload/") },
  { permission: "marking", matches: (path) => path === "/owner/marking-queue" || path.startsWith("/owner/marking-queue/") },
  { permission: "marking", matches: (path) => path === "/owner/feedback-releases" || path.startsWith("/owner/feedback-releases/") },
  { permission: "marking", matches: (path) => path === "/owner/comment-bank" || path.startsWith("/owner/comment-bank/") },
  { permission: "analytics", matches: (path) => path === "/owner/analytics" || path.startsWith("/owner/analytics/") },
  { permission: "analytics", matches: (path) => path === "/owner/topics" || path.startsWith("/owner/topics/") },
  { permission: "analytics", matches: (path) => path === "/owner/standards" || path.startsWith("/owner/standards/") },
  { permission: "analytics", matches: (path) => path === "/owner/mistakes" || path.startsWith("/owner/mistakes/") },
  { permission: "analytics", matches: (path) => path === "/owner/revision" || path.startsWith("/owner/revision/") },
  { permission: "student_management", matches: (path) => path === "/owner/students" || path.startsWith("/owner/students/") },
  { permission: "student_management", matches: (path) => path === "/owner/cohorts" || path.startsWith("/owner/cohorts/") },
  { permission: "student_data", matches: (path) => path === "/owner/support" || path.startsWith("/owner/support/") },
  { permission: "assessment_authoring", matches: (path) => path === "/owner/assessments" || path.startsWith("/owner/assessments/") },
  { permission: "assessment_authoring", matches: (path) => path === "/owner/templates" || path.startsWith("/owner/templates/") },
  { permission: "assessment_authoring", matches: (path) => path === "/owner/paper-generator" || path.startsWith("/owner/paper-generator/") },
  { permission: "assessment_authoring", matches: (path) => path === "/owner/question-bank" || path.startsWith("/owner/question-bank/") },
];

export function requiredPermissionForOwnerPath(pathname: string): InstitutionPermission {
  const normalizedPath = normalizeOwnerPath(pathname);
  return OWNER_ROUTE_PERMISSION_RULES.find((rule) => rule.matches(normalizedPath))?.permission ?? "student_data";
}

export function canAccessOwnerPath(pathname: string, permissions: readonly InstitutionPermission[]) {
  return permissions.includes(requiredPermissionForOwnerPath(pathname));
}

export function filterOwnerNavigationSections<
  TItem extends { requiredPermission?: InstitutionPermission },
  TSection extends { items: readonly TItem[] },
>(sections: readonly TSection[], permissions: readonly InstitutionPermission[]) {
  const permissionSet = new Set(permissions);
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.requiredPermission || permissionSet.has(item.requiredPermission)),
    }))
    .filter((section) => section.items.length > 0);
}

function normalizeOwnerPath(pathname: string) {
  const withoutQuery = pathname.split("?")[0]?.split("#")[0] ?? "/owner";
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) return withoutQuery.slice(0, -1);
  return withoutQuery || "/owner";
}
