import { requireAppRole } from "@/lib/auth/server";
import { OwnerShell } from "@/components/owner/owner-shell";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireAppRole("owner", "/owner");

  return (
    <OwnerShell displayName={profile?.display_name || "Admin User"}>
      {children}
    </OwnerShell>
  );
}
