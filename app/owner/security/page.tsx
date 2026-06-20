import { OwnerMfaPanel, OwnerPasswordPanel } from "@/components/auth/mfa-panel";
import { DeploymentReadinessConsole } from "@/components/owner/deployment-readiness-console";
import { ExamsimProductionReadinessPanel } from "@/components/owner/examsim-production-readiness-panel";
import { InstitutionRoleMatrixPanel } from "@/components/owner/institution-role-matrix-panel";
import { InstitutionMembershipManager } from "@/components/owner/institution-membership-manager";
import { ProviderReadinessDashboard } from "@/components/owner/provider-readiness-dashboard";
import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { ReadinessList, ReadinessListRow } from "@/components/ui/readiness-list";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ImportAuditLike, ImportJobLike } from "@/lib/examsim/provider-readiness";

export const dynamic = "force-dynamic";

const PRODUCTION_BASELINE = [
  ["Owner MFA", "Supabase TOTP upgrades owner sessions to AAL2."],
  ["Student accounts", "Owner-issued aliases and activation codes, not real email delivery."],
  ["Browser Mode", "Tamper-evident only; server functions enforce timing, release, uploads, and exports."],
  ["SEB Secure Mode", "Requires copied Browser Exam Key and Config Key values; user-agent checks are not accepted."],
  ["Age attestation", "Students must be 13+ for production v1; the app stores an owner attestation, not a date of birth."],
] as const;

export default async function OwnerSecurityPage() {
  const [importJobs, importAuditLogs, membershipData] = await Promise.all([
    loadRecentImportJobs(),
    loadRecentImportAuditLogs(),
    loadInstitutionMembershipData(),
  ]);

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
            <ReadinessList aria-label="Production security controls">
              {PRODUCTION_BASELINE.map(([control, rule]) => (
                <ReadinessListRow
                  key={control}
                  className="grid gap-1 py-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4"
                >
                  <p className="font-semibold text-[var(--ink)]">{control}</p>
                  <p className="min-w-0 break-words text-[13px] leading-5 text-[var(--muted)]">{rule}</p>
                </ReadinessListRow>
              ))}
            </ReadinessList>
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
        <ProviderReadinessDashboard importJobs={importJobs} importAuditLogs={importAuditLogs} />
      </div>
      <div className="mt-5">
        <DeploymentReadinessConsole />
      </div>
      <div className="mt-5">
        <InstitutionRoleMatrixPanel />
      </div>
      <div className="mt-5">
        <InstitutionMembershipManager memberships={membershipData.memberships} accounts={membershipData.accounts} />
      </div>
      <div className="mt-5">
        <ExamsimProductionReadinessPanel />
      </div>
    </>
  );
}

async function loadInstitutionMembershipData() {
  const supabase = await createSupabaseServerClient();
  const [{ data: memberships, error: membershipError }, { data: accounts, error: accountError }] = await Promise.all([
    supabase.from("institution_memberships").select("id,member_profile_id,role,status,display_label,updated_at").order("updated_at", { ascending: false }),
    supabase.from("profiles").select("id,display_name,app_role").order("display_name"),
  ]);
  if (membershipError) throw membershipError;
  if (accountError) throw accountError;
  return {
    memberships: (memberships ?? []) as Array<{ id: string; member_profile_id: string; role: "owner_admin" | "teacher" | "marker" | "reviewer" | "invigilator" | "read_only"; status: "active" | "invited" | "disabled"; display_label: string | null; updated_at: string }>,
    accounts: accounts ?? [],
  };
}

async function loadRecentImportAuditLogs(): Promise<ImportAuditLike[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("owner_audit_logs")
      .select("action, target_table, target_id, metadata_json, created_at")
      .order("created_at", { ascending: false })
      .limit(40);

    if (error) {
      console.warn("Unable to load import audit logs for readiness dashboard", error.message);
      return [];
    }
    return (data ?? []).filter((entry) => isImportAuditAction(entry.action)).slice(0, 12);
  } catch (error) {
    console.warn("Unable to initialize readiness dashboard import-audit query", error);
    return [];
  }
}

function isImportAuditAction(action: string | null | undefined) {
  const value = String(action ?? "");
  return value.startsWith("mineru_")
    || value.startsWith("ai_parse.")
    || value === "assessment.ingested"
    || value === "qti.imported"
    || value.startsWith("markscheme_");
}

async function loadRecentImportJobs(): Promise<ImportJobLike[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("parse_jobs")
      .select("id, parser, status, requested_ocr, external_state, metadata_json, error_message, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) {
      console.warn("Unable to load recent import jobs for readiness dashboard", error.message);
      return [];
    }
    return data ?? [];
  } catch (error) {
    console.warn("Unable to initialize readiness dashboard import-job query", error);
    return [];
  }
}
