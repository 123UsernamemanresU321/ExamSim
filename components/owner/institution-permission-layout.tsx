import type { InstitutionPermission } from "@/lib/examsim/institution-role-matrix";
import {
  requireInstitutionPageAnyPermission,
  requireInstitutionPagePermission,
} from "@/lib/examsim/institution-roles";

export async function InstitutionPermissionLayout({
  children,
  permission,
  path,
}: {
  children: React.ReactNode;
  permission: InstitutionPermission;
  path: string;
}) {
  await requireInstitutionPagePermission(permission, path);
  return children;
}

export async function InstitutionAnyPermissionLayout({
  children,
  permissions,
  path,
}: {
  children: React.ReactNode;
  permissions: readonly InstitutionPermission[];
  path: string;
}) {
  await requireInstitutionPageAnyPermission(permissions, path);
  return children;
}
