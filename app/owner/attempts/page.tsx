import { SectionHeading } from "@/components/section-heading";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";
import { ExamStateBadge } from "@/components/ui/status-badge";
import { listOwnerAttempts } from "@/lib/live-data";

export default async function OwnerAttemptsPage() {
  const attempts = await listOwnerAttempts();
  return (
    <>
      <SectionHeading
        title="Attempts"
        description="Owner view of upcoming, active, upload-only, and review-ready sittings."
      />
      {attempts.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--muted)]">No attempts scheduled yet.</p>
        </Card>
      ) : (
        <DataTable headers={["Attempt", "Student", "State", "Action"]}>
          {attempts.map((attempt) => (
            <DataTableRow key={attempt.id}>
              <DataTableCell className="w-[45%]">
                <p className="truncate font-semibold text-[var(--ink)]">{attempt.title}</p>
                <p className="mt-1 font-mono text-xs text-[var(--muted)]">{attempt.paper_code ?? "No paper code"}</p>
              </DataTableCell>
              <DataTableCell className="w-[25%] text-[var(--muted)]">{attempt.student}</DataTableCell>
              <DataTableCell className="w-[15%]">
                <ExamStateBadge state={attempt.state} />
              </DataTableCell>
              <DataTableCell className="w-[15%] text-right">
                <ButtonLink href={`/owner/attempts/${attempt.id}`} variant="secondary">
                  Review
                </ButtonLink>
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTable>
      )}
    </>
  );
}
