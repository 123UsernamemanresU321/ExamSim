import type { InstitutionPermission } from "@/lib/examsim/institution-role-matrix";
import { requireInstitutionPagePermission } from "@/lib/examsim/institution-roles";

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
