import { disableInstitutionMembershipAction, setInstitutionMembershipAction } from "@/app/owner/security/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";
import { Field, Select } from "@/components/ui/form";
import { INSTITUTION_ROLE_KEYS, INSTITUTION_ROLE_LABELS, type InstitutionRole } from "@/lib/examsim/institution-role-matrix";

type MembershipRow = {
  id: string;
  member_profile_id: string;
  role: InstitutionRole;
  status: "active" | "invited" | "disabled";
  display_label: string | null;
  updated_at: string;
};

type AccountOption = { id: string; display_name: string; app_role: string };

export function InstitutionMembershipManager({ memberships, accounts }: { memberships: MembershipRow[]; accounts: AccountOption[] }) {
  const activeMemberIds = new Set(memberships.filter((membership) => membership.status === "active").map((membership) => membership.member_profile_id));
  const availableAccounts = accounts.filter((account) => !activeMemberIds.has(account.id));
  return (
    <Card aria-label="Institution membership manager">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">Institution collaborators</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Grant an existing Exam Vault account one active role in this workspace. Role changes require owner MFA and are written to the audit log.
          </p>
        </div>
        <Badge tone="info">Owner managed</Badge>
      </div>

      <form action={setInstitutionMembershipAction} className="mt-5 grid gap-4 md:grid-cols-[minmax(220px,1fr)_220px_auto] md:items-end">
        <Field label="Existing account" tooltip="Choose an account that already exists in this Supabase project. This does not create a login or send email.">
          <Select name="member_profile_id" required defaultValue="">
            <option value="" disabled>Select account</option>
            {availableAccounts.map((account) => <option key={account.id} value={account.id}>{account.display_name} ({account.app_role})</option>)}
          </Select>
        </Field>
        <Field label="Institution role" tooltip="Controls server routes, database policies, and visible navigation for this workspace.">
          <Select name="role" required defaultValue="teacher">
            {INSTITUTION_ROLE_KEYS.map((role) => <option key={role} value={role}>{INSTITUTION_ROLE_LABELS[role]}</option>)}
          </Select>
        </Field>
        <Button type="submit" disabled={availableAccounts.length === 0}>Grant access</Button>
      </form>
      {availableAccounts.length === 0 ? <p className="mt-3 text-xs text-[var(--muted)]">No unassigned existing accounts are available.</p> : null}

      <div className="mt-6">
        {memberships.length === 0 ? (
          <p className="rounded-[4px] border border-dashed border-[var(--border)] p-5 text-sm text-[var(--muted)]">No collaborator roles have been assigned.</p>
        ) : (
          <DataTable headers={["Account", "Role", "Status", "Changed", "Action"]} className="shadow-none">
            {memberships.map((membership) => (
              <DataTableRow key={membership.id}>
                <DataTableCell><p className="font-semibold text-[var(--ink)]">{membership.display_label ?? "Institution member"}</p><p className="font-mono text-[11px] text-[var(--subtle)]">{membership.member_profile_id.slice(0, 8)}</p></DataTableCell>
                <DataTableCell>{INSTITUTION_ROLE_LABELS[membership.role]}</DataTableCell>
                <DataTableCell><Badge tone={membership.status === "active" ? "success" : "neutral"}>{membership.status}</Badge></DataTableCell>
                <DataTableCell className="font-mono text-xs text-[var(--muted)]">{new Date(membership.updated_at).toLocaleDateString()}</DataTableCell>
                <DataTableCell>
                  {membership.status === "active" ? (
                    <form action={disableInstitutionMembershipAction.bind(null, membership.id)}>
                      <Button type="submit" variant="dangerSubtle">Disable</Button>
                    </form>
                  ) : null}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTable>
        )}
      </div>
    </Card>
  );
}
