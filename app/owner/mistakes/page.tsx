import { AlertCircle, BarChart3 } from "lucide-react";
import { listMistakeTaxonomyWorkspace } from "@/lib/usability-data";
import { Card } from "@/components/ui/card";

export default async function MistakeTaxonomyPage() {
  const { categories, instances } = await listMistakeTaxonomyWorkspace();
  const counts = new Map<string, number>();
  for (const instance of instances) counts.set(instance.category_id, (counts.get(instance.category_id) ?? 0) + 1);

  return (
    <main className="space-y-6 p-8">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--subtle)]">Mistake Taxonomy</p>
        <h1 className="mt-2 text-3xl font-black text-[var(--ink)]">Reusable mistake categories</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          Track why marks were lost without exposing private marker notes. Student-visible mistake tags are released only through the feedback workflow.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Categories" value={categories.length} />
        <Metric label="Tagged mistakes" value={instances.length} />
        <Metric label="Student-visible" value={instances.filter((item) => item.student_visible).length} />
      </div>

      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <AlertCircle size={18} className="text-[var(--primary)]" />
          <h2 className="font-black text-[var(--ink)]">Categories</h2>
        </div>
        {categories.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {categories.map((category) => (
              <div key={category.id} className="rounded-lg border border-[var(--border)] bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-[var(--ink)]">{category.name}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{category.description ?? "No description yet."}</p>
                  </div>
                  <span className="rounded-full bg-[var(--surface-muted)] px-2 py-1 text-xs font-black text-[var(--muted)]">
                    {counts.get(category.id) ?? 0}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-8 text-sm text-[var(--muted)]">
            No mistake categories exist yet. The migration adds default categories for owner profiles.
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 size={18} className="text-[var(--primary)]" />
          <h2 className="font-black text-[var(--ink)]">Recent mistake instances</h2>
        </div>
        {instances.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-widest text-[var(--subtle)]">
                <tr>
                  <th className="py-2">Question</th>
                  <th className="py-2">Severity</th>
                  <th className="py-2">Visible</th>
                  <th className="py-2">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {instances.slice(0, 20).map((instance) => (
                  <tr key={instance.id}>
                    <td className="py-3 font-mono text-xs">{instance.question_node_id.slice(0, 8)}</td>
                    <td className="py-3 capitalize">{instance.severity}</td>
                    <td className="py-3">{instance.student_visible ? "Released" : "Private"}</td>
                    <td className="py-3 text-[var(--muted)]">{instance.note ?? "No note"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-8 text-sm text-[var(--muted)]">
            Mistake instances will appear here as markers tag student work.
          </div>
        )}
      </Card>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-5">
      <p className="text-3xl font-black text-[var(--ink)]">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-widest text-[var(--subtle)]">{label}</p>
    </Card>
  );
}
