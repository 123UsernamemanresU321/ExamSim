import { OwnerShell } from "@/components/owner/owner-shell";
import { requireInstitutionContext } from "@/lib/examsim/institution-roles";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const context = await requireInstitutionContext("/owner");

  return (
    <OwnerShell
      displayName={context.displayName}
      institutionRole={context.role}
      institutionPermissions={context.permissions}
    >
      {children}
    </OwnerShell>
  );
}
