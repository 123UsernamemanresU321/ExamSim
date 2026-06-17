import { OwnerMfaPanel, OwnerPasswordPanel } from "@/components/auth/mfa-panel";
import { ExamsimProductionReadinessPanel } from "@/components/owner/examsim-production-readiness-panel";
import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";

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
          <div className="mt-4">
            <DataTable headers={["Control", "Production rule"]} className="shadow-none">
              <DataTableRow>
                <DataTableCell className="font-semibold">Owner MFA</DataTableCell>
                <DataTableCell className="text-[var(--muted)]">Supabase TOTP upgrades owner sessions to AAL2.</DataTableCell>
              </DataTableRow>
              <DataTableRow>
                <DataTableCell className="font-semibold">Student accounts</DataTableCell>
                <DataTableCell className="text-[var(--muted)]">Owner-issued aliases and activation codes, not real email delivery.</DataTableCell>
              </DataTableRow>
              <DataTableRow>
                <DataTableCell className="font-semibold">Browser Mode</DataTableCell>
                <DataTableCell className="text-[var(--muted)]">Tamper-evident only; server functions enforce timing, release, uploads, and exports.</DataTableCell>
              </DataTableRow>
              <DataTableRow>
                <DataTableCell className="font-semibold">SEB Secure Mode</DataTableCell>
                <DataTableCell className="text-[var(--muted)]">Requires copied Browser Exam Key and Config Key values; user-agent checks are not accepted.</DataTableCell>
              </DataTableRow>
              <DataTableRow>
                <DataTableCell className="font-semibold">Age attestation</DataTableCell>
                <DataTableCell className="text-[var(--muted)]">Students must be 13+ for production v1; the app stores an owner attestation, not a date of birth.</DataTableCell>
              </DataTableRow>
            </DataTable>
          </div>
          <div className="mt-5 rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm leading-6 text-[var(--muted)]">
            <p className="font-semibold text-[var(--ink)]">SEB setup</p>
            <p>
              Generate and save the final Safe Exam Browser configuration for the assessment, then copy the Browser Exam
              Key and Config Key into the publish form. Exam Vault verifies SEB request hashes server-side for the exact
              exam URL; test the final `.seb` file before assigning students.
            </p>
          </div>
        </Card>
      </div>
      <div className="mt-5">
        <ExamsimProductionReadinessPanel />
      </div>
    </>
  );
}
