import { PasskeyEnrollmentPanel, PasskeyManagementPanel } from "@/components/auth/passkey-panel";
import { SectionHeading } from "@/components/section-heading";
import { RecoveryCodeGenerator } from "@/components/student/student-interactive-panels";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

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
        <RecoveryCodeGenerator />
        <Card>
          <h2 className="text-lg font-semibold">Account shortcuts</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Alias/password login remains available. Recovery codes are stored hashed and shown only once.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <ButtonLink href="/student/devices" variant="secondary">Devices</ButtonLink>
            <ButtonLink href="/student/notification-settings" variant="secondary">Notifications</ButtonLink>
          </div>
        </Card>
      </div>
    </>
  );
}
