import Link from "next/link";
import { Bookmark, Save } from "lucide-react";
import { deleteOwnerSavedView, saveOwnerSavedView } from "@/app/owner/operations-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { SavedViewScope } from "@/lib/owner-operations";
import type { OwnerSavedView } from "@/types/database";

export function SavedViewsToolbar({
  scope,
  views,
  basePath,
  currentFilters,
}: {
  scope: SavedViewScope;
  views: OwnerSavedView[];
  basePath: string;
  currentFilters: Record<string, unknown>;
}) {
  return (
    <Card className="grid gap-3 p-3 shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
          <Bookmark size={16} className="text-[var(--subtle)]" aria-hidden="true" />
          Saved views
        </div>
        <form action={saveOwnerSavedView.bind(null, scope)} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="filters_json" value={JSON.stringify(currentFilters)} />
          <input type="hidden" name="sort_json" value="{}" />
          <input type="hidden" name="columns_json" value="{}" />
          <input
            name="name"
            placeholder="Save current filters"
            className="h-9 min-w-[190px] rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm"
          />
          <label className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
            <input name="is_default" type="checkbox" />
            Default
          </label>
          <Button type="submit" variant="secondary" className="h-9">
            <Save size={15} aria-hidden="true" />
            Save view
          </Button>
        </form>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href={basePath}
          className="inline-flex h-8 items-center rounded-[2px] border border-[var(--border)] bg-white px-3 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-muted)]"
        >
          Clear filters
        </Link>
        {views.map((view) => {
          const href = buildSavedViewHref(basePath, view);
          return (
            <span key={view.id} className="inline-flex overflow-hidden rounded-[2px] border border-[var(--border)] bg-white">
              <Link href={href} className="inline-flex h-8 items-center px-3 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)]">
                {view.name}
                {view.is_default ? <span className="ml-2 font-mono text-[10px] uppercase text-[var(--primary)]">default</span> : null}
              </Link>
              <form action={deleteOwnerSavedView.bind(null, scope, view.id)} className="border-l border-[var(--border)]">
                <button type="submit" className="h-8 px-2 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]" aria-label={`Delete saved view ${view.name}`}>
                  Remove
                </button>
              </form>
            </span>
          );
        })}
        {!views.length ? <span className="text-xs text-[var(--muted)]">No saved views yet.</span> : null}
      </div>
    </Card>
  );
}

function buildSavedViewHref(basePath: string, view: OwnerSavedView) {
  const params = new URLSearchParams();
  const filters = view.filters_json && typeof view.filters_json === "object" && !Array.isArray(view.filters_json)
    ? view.filters_json as Record<string, unknown>
    : {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  params.set("view", view.id);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
