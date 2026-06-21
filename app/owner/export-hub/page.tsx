import { BarChart3, Database, FileDown, ShieldCheck } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { ExportHubDownloads } from "@/components/owner/export-hub-downloads";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataList, DataListMeta, DataListRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { buildExportHubCatalog, type ExportHubDataset } from "@/lib/examsim/export-hub";
import {
  listOwnerAssessments,
  listOwnerAttempts,
  listOwnerRosterEntries,
  listOwnerStudentGroups,
  listOwnerStudents,
} from "@/lib/live-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OwnerExportHubPage() {
  const [assessments, attempts, students, rosterEntries, groups] = await Promise.all([
    listOwnerAssessments(),
    listOwnerAttempts(),
    listOwnerStudents(),
    listOwnerRosterEntries(),
    listOwnerStudentGroups(),
  ]);

  const dataset: ExportHubDataset = {
    assessments,
    attempts,
    students,
    rosterEntries,
    groups,
  };
  const catalog = buildExportHubCatalog(dataset);
  const readyCount = catalog.filter((item) => item.status === "ready").length;
  const reviewCount = catalog.filter((item) => item.status === "needs_review").length;
  const unsupportedCount = catalog.filter((item) => item.status === "unsupported").length;

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Review"
        title="Export Hub"
        description="Owner-only handoff exports for markbooks, roster reconciliation, cohort reporting, assessment inventory, and analytics validation. Unsupported formats stay visibly blocked instead of pretending to be lossless."
        actions={<ButtonLink href="/api/owner/exports/analytics-report" target="_blank" variant="secondary"><FileDown size={16} /> Group analytics PDF</ButtonLink>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ready exports" value={readyCount} tone={readyCount ? "success" : "neutral"} icon={<FileDown size={18} aria-hidden="true" />} />
        <StatCard label="Needs review" value={reviewCount} tone={reviewCount ? "warning" : "neutral"} icon={<ShieldCheck size={18} aria-hidden="true" />} />
        <StatCard label="Unsupported" value={unsupportedCount} tone={unsupportedCount ? "danger" : "neutral"} icon={<Database size={18} aria-hidden="true" />} />
        <StatCard label="Attempts in extract" value={attempts.length} icon={<BarChart3 size={18} aria-hidden="true" />} />
      </div>

      <Card className="p-6">
        <SectionHeader
          title="Downloadable exports"
          description="CSV cells are escaped for spreadsheet safety. Student-facing analytics still require release filtering before display."
        />
        <ExportHubDownloads catalog={catalog} dataset={dataset} />
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="p-6">
          <SectionHeader
            title="Export governance"
            description="Formats are intentionally conservative until fidelity and permission boundaries are verified."
          />
          <DataList className="mt-4">
            <DataListRow className="grid gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="success">Ready</Badge>
                <p className="font-semibold text-[var(--ink)]">CSV / JSON handoff</p>
              </div>
              <p className="text-sm leading-6 text-[var(--muted)]">
                Markbook, roster, cohort, assessment inventory, and analytics handoff exports are generated from the same owner-scoped data loaders used by the dashboard.
              </p>
            </DataListRow>
            <DataListRow className="grid gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="info">Edge export</Badge>
                <p className="font-semibold text-[var(--ink)]">QTI ZIP</p>
              </div>
              <p className="text-sm leading-6 text-[var(--muted)]">
                QTI remains assessment-scoped and goes through the existing AAL2-gated Edge Function from an assessment page.
              </p>
            </DataListRow>
            <DataListRow className="grid gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="warning">Review required</Badge>
                <p className="font-semibold text-[var(--ink)]">Moodle XML</p>
              </div>
              <p className="text-sm leading-6 text-[var(--muted)]">
                Published assessments can export conservative Moodle XML. Unsupported interactions become manually graded essay questions and every export carries explicit fidelity warnings.
              </p>
            </DataListRow>
          </DataList>
        </Card>

        <Card className="p-6">
          <SectionHeader title="School reporting snapshot" description="Current data available for cohort and school-level export validation." />
          {groups.length || rosterEntries.length || attempts.length ? (
            <DataList className="mt-4">
              <DataListRow>
                <p className="font-semibold text-[var(--ink)]">{groups.length} group(s)</p>
                <DataListMeta className="mt-1">
                  <span>{groups.reduce((sum, group) => sum + group.member_count, 0)} group memberships</span>
                </DataListMeta>
              </DataListRow>
              <DataListRow>
                <p className="font-semibold text-[var(--ink)]">{rosterEntries.length} roster entr{rosterEntries.length === 1 ? "y" : "ies"}</p>
                <DataListMeta className="mt-1">
                  <span>{students.length} student account(s)</span>
                </DataListMeta>
              </DataListRow>
              <DataListRow>
                <p className="font-semibold text-[var(--ink)]">{attempts.length} attempt(s)</p>
                <DataListMeta className="mt-1">
                  <span>{assessments.length} assessment(s)</span>
                </DataListMeta>
              </DataListRow>
            </DataList>
          ) : (
            <EmptyState
              title="No exportable reporting data yet"
              description="Create assessments, groups, roster entries, and attempts before school-level exports become useful."
            />
          )}
        </Card>
      </div>

      <ExportHistory />
    </main>
  );
}

async function ExportHistory() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("export_download_history").select("id,export_kind,format,status,row_count,created_at").order("created_at", { ascending: false }).limit(20);
  if (error) throw error;
  return <Card className="p-6"><SectionHeader title="Download history" description="Audited owner-scoped evidence for generated handoffs and fidelity review." />{data?.length ? <DataList className="mt-4">{data.map((entry) => <DataListRow key={entry.id} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><p className="font-semibold text-[var(--ink)]">{entry.export_kind.replaceAll("_", " ")}</p><DataListMeta><span>{entry.format}</span><span>{entry.row_count ?? 0} rows/items</span><span>{new Date(entry.created_at).toLocaleString()}</span></DataListMeta></div><Badge tone={entry.status === "completed" ? "success" : entry.status === "review_required" ? "warning" : "danger"}>{entry.status.replaceAll("_", " ")}</Badge></DataListRow>)}</DataList> : <EmptyState title="No export history" description="Downloads generated after the export-governance migration appear here." />}</Card>;
}
