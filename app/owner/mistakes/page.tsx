import { AlertCircle, BarChart3 } from "lucide-react";
import { listMistakeTaxonomyWorkspace } from "@/lib/usability-data";
import { Card } from "@/components/ui/card";
import { DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";

export default async function MistakeTaxonomyPage() {
  const { categories, instances } = await listMistakeTaxonomyWorkspace();
  const counts = new Map<string, number>();
  for (const instance of instances) counts.set(instance.category_id, (counts.get(instance.category_id) ?? 0) + 1);

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Mistake taxonomy"
        title="Reusable mistake categories"
        description="Track why marks were lost without exposing private marker notes. Student-visible mistake tags are released only through the feedback workflow."
      />

      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Categories" value={categories.length} />
        <StatCard label="Tagged mistakes" value={instances.length} />
        <StatCard label="Student-visible" value={instances.filter((item) => item.student_visible).length} tone="info" />
      </div>

      <Card className="p-6">
        <SectionHeader title="Categories" actions={<AlertCircle size={18} className="text-[var(--primary)]" aria-hidden="true" />} />
        {categories.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {categories.map((category) => (
              <div key={category.id} className="rounded-lg border border-[var(--border)] bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--ink)]">{category.name}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{category.description ?? "No description yet."}</p>
                  </div>
                  <span className="rounded-full bg-[var(--surface-muted)] px-2 py-1 text-xs font-semibold text-[var(--muted)]">
                    {counts.get(category.id) ?? 0}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No mistake categories" description="Default categories are created for owner profiles; new categories can be added from marking workflows." />
        )}
      </Card>

      <Card className="p-6">
        <SectionHeader title="Recent mistake instances" actions={<BarChart3 size={18} className="text-[var(--primary)]" aria-hidden="true" />} />
        {instances.length ? (
          <DataTable headers={["Question", "Severity", "Visibility", "Note"]}>
            {instances.slice(0, 20).map((instance) => (
              <DataTableRow key={instance.id}>
                <DataTableCell className="font-mono text-xs">{instance.question_node_id.slice(0, 8)}</DataTableCell>
                <DataTableCell className="capitalize">{instance.severity}</DataTableCell>
                <DataTableCell>{instance.student_visible ? "Released" : "Private"}</DataTableCell>
                <DataTableCell className="text-[var(--muted)]">{instance.note ?? "No note"}</DataTableCell>
              </DataTableRow>
            ))}
          </DataTable>
        ) : (
          <EmptyState title="No mistake instances" description="Mistake instances appear here as markers tag released or private marking records." />
        )}
      </Card>
    </main>
  );
}
