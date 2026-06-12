import { LifeBuoy, Search } from "lucide-react";
import { AttemptStateBadge } from "@/components/attempt-state-badge";
import { SavedViewsToolbar } from "@/components/owner/saved-views-toolbar";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { getStudentSupportConsole, listOwnerSavedViews } from "@/lib/owner-operations";

export default async function OwnerSupportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";
  const [rows, views] = await Promise.all([
    getStudentSupportConsole(search),
    listOwnerSavedViews("support_console"),
  ]);

  return (
    <main className="space-y-6 pb-12">
      <SectionHeading
        title="Student Support Console"
        description="A safe operational view for student issues: current state, uploads, incidents, recovery status, receipts, and feedback visibility."
      />

      <SavedViewsToolbar
        scope="support_console"
        views={views}
        basePath="/owner/support"
        currentFilters={{ q: search }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Find a student or attempt</CardTitle>
          <CardDescription>Search by student name, assessment title, paper code, or attempt id.</CardDescription>
        </CardHeader>
        <form className="flex flex-wrap gap-2">
          <label className="flex min-w-[260px] flex-1 items-center gap-2 rounded-[2px] border border-[var(--border)] bg-white px-3 py-2">
            <Search size={16} className="text-[var(--subtle)]" aria-hidden="true" />
            <input name="q" defaultValue={search} placeholder="Search support console" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
          <button type="submit" className="inline-flex h-10 items-center justify-center rounded-[2px] bg-[var(--primary)] px-4 text-sm font-semibold !text-white">
            Search
          </button>
        </form>
      </Card>

      {rows.length ? (
        <DataTable headers={["Student & assessment", "State", "Uploads", "Incidents", "Feedback", "Actions"]}>
          {rows.map((row) => (
            <DataTableRow key={row.attempt.id}>
              <DataTableCell className="min-w-[260px]">
                <h2 className="font-semibold text-[var(--ink)]">{row.student?.display_name ?? "Student"}</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {row.assessment?.title ?? "Assessment"} · <span className="font-mono">{row.assessment?.paper_code ?? row.attempt.id.slice(0, 8)}</span>
                </p>
              </DataTableCell>
              <DataTableCell><AttemptStateBadge state={row.state} /></DataTableCell>
              <DataTableCell>
                <div className="grid gap-1 text-xs text-[var(--muted)]">
                  <span><strong className="text-[var(--ink)]">{row.slots.filter((slot) => slot.status === "uploaded").length}/{row.slots.length}</strong> uploaded</span>
                  <span>{row.queueEvents.filter((event) => event.event_type === "failed").length} failed queue event(s)</span>
                </div>
              </DataTableCell>
              <DataTableCell>
                {row.incidents.length ? <Badge tone="warning">{row.incidents.length} student report(s)</Badge> : <Badge tone="neutral">none</Badge>}
              </DataTableCell>
              <DataTableCell>
                <Badge tone={row.feedbackRelease?.visible_to_student ? "success" : row.feedbackRelease ? "warning" : "neutral"}>
                  {row.feedbackRelease?.visible_to_student ? "released" : row.feedbackRelease ? "held" : "not prepared"}
                </Badge>
              </DataTableCell>
              <DataTableCell className="text-right">
                <div className="flex flex-wrap justify-end gap-2">
                  <ButtonLink href={`/owner/attempts/${row.attempt.id}/recovery`} variant="secondary">
                    <LifeBuoy size={16} aria-hidden="true" />
                    Recovery
                  </ButtonLink>
                  <ButtonLink href={`/owner/attempts/${row.attempt.id}/mark`}>Open</ButtonLink>
                </div>
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTable>
      ) : (
        <EmptyState title="No matching support records" description="Try another student name, paper code, assessment title, or attempt id." />
      )}
    </main>
  );
}
