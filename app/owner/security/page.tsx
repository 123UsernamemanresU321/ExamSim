import { OwnerMfaPanel, OwnerPasswordPanel } from "@/components/auth/mfa-panel";
import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";

export default function OwnerSecurityPage() {
  return (
    <>
      <SectionHeading
        title="Security"
        description="Harden owner access before changing students, publishing assessments, exporting packets, or releasing feedback."
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(420px,620px)_minmax(360px,1fr)]">
        <div className="grid gap-5">
          <OwnerMfaPanel />
          <OwnerPasswordPanel />
        </div>
        <Card className="content-start">
          <h2 className="text-lg font-semibold">Production baseline</h2>
          <ul className="mt-3 grid gap-3 text-sm leading-6 text-[var(--muted)]">
            <li>Owner MFA uses Supabase TOTP and upgrades the session to AAL2.</li>
            <li>Student accounts use owner-issued aliases and activation codes, not real email delivery.</li>
            <li>Browser Mode remains tamper-evident. Server functions enforce timing, release, uploads, and exports.</li>
            <li>Students must be 13+ for production v1; the app stores an owner attestation, not a date of birth.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
