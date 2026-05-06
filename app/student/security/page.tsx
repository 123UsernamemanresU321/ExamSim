import { PasskeyEnrollmentPanel, PasskeyManagementPanel } from "@/components/auth/passkey-panel";
import { SectionHeading } from "@/components/section-heading";

export default function StudentSecurityPage() {
  return (
    <>
      <SectionHeading
        title="Student security"
        description="Manage optional passkeys. Alias and password login remain available."
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <PasskeyEnrollmentPanel />
        <PasskeyManagementPanel />
      </div>
    </>
  );
}
