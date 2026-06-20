import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";
import {
  INSTITUTION_PERMISSION_KEYS,
  INSTITUTION_PERMISSION_LABELS,
  INSTITUTION_ROLE_KEYS,
  INSTITUTION_ROLE_LABELS,
  roleHasInstitutionPermission,
} from "@/lib/examsim/institution-role-matrix";

export function InstitutionRoleMatrixPanel() {
  return (
    <Card className="content-start" aria-label="Institution role matrix">
      <div className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Institution role matrix</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            V3 collaborator roles are scoped to an owner workspace and enforced through server-side permission checks.
            Students never receive direct access to owner-only assessment, marking, export, or readiness data.
          </p>
        </div>
        <Badge tone="warning">Route-by-route live validation required</Badge>
      </div>

      <div className="mt-5">
        <DataTable
          headers={["Role", ...INSTITUTION_PERMISSION_KEYS.map((permission) => INSTITUTION_PERMISSION_LABELS[permission])]}
          className="shadow-none"
        >
          {INSTITUTION_ROLE_KEYS.map((role) => (
            <DataTableRow key={role}>
              <DataTableCell className="min-w-[160px] font-semibold text-[var(--ink)]">
                {INSTITUTION_ROLE_LABELS[role]}
              </DataTableCell>
              {INSTITUTION_PERMISSION_KEYS.map((permission) => (
                <DataTableCell key={permission} className="text-center">
                  <span
                    className={
                      roleHasInstitutionPermission(role, permission)
                        ? "inline-flex h-5 min-w-5 items-center justify-center rounded-[2px] bg-emerald-50 px-1.5 text-[11px] font-semibold text-emerald-700"
                        : "inline-flex h-5 min-w-5 items-center justify-center rounded-[2px] bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-400"
                    }
                    aria-label={`${INSTITUTION_ROLE_LABELS[role]} ${
                      roleHasInstitutionPermission(role, permission) ? "can" : "cannot"
                    } ${INSTITUTION_PERMISSION_LABELS[permission]}`}
                  >
                    {roleHasInstitutionPermission(role, permission) ? "Yes" : "No"}
                  </span>
                </DataTableCell>
              ))}
            </DataTableRow>
          ))}
        </DataTable>
      </div>

      <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
        Membership rows live in <span className="font-mono text-[var(--ink)]">institution_memberships</span> with
        owner-only management RLS and member self-read RLS. The matrix is intentionally conservative until every
        sensitive route has been validated on the actual website with teacher, marker, reviewer, invigilator, and
        read-only test accounts.
      </p>
    </Card>
  );
}
