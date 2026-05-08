import { AppHeader } from "@/components/app-header";
import { requireAppRole } from "@/lib/auth/server";
import { OwnerShell } from "@/components/owner/owner-shell";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  await requireAppRole("owner", "/owner");

  return (
    <>
      <AppHeader />
      <OwnerShell>
        {children}
      </OwnerShell>
    </>
  );
}
