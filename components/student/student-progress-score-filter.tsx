"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { StudentProgressScoreGroup } from "@/lib/student-experience";

const FILTERS: Array<{ key: StudentProgressScoreGroup["kind"] | "overall"; label: string }> = [
  { key: "overall", label: "Overall" },
  { key: "subject", label: "Subjects" },
  { key: "assessment_kind", label: "Test types" },
  { key: "paper_code", label: "Papers" },
];

export function StudentProgressScoreFilter({
  overallScore,
  groups,
}: {
  overallScore: number | null;
  groups: StudentProgressScoreGroup[];
}) {
  const [active, setActive] = useState<StudentProgressScoreGroup["kind"] | "overall">("overall");
  const visibleGroups = useMemo(() => groups.filter((group) => group.kind === active), [active, groups]);

  return (
    <div className="rounded-md border border-[var(--border)] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.16em] text-[var(--subtle)]">Released score filter</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Toggle the average by subject, assessment type, or paper code.</p>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Released score filters">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                active === filter.key
                  ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                  : "border-[var(--border)] bg-white text-[var(--muted)] hover:bg-[var(--surface-muted)]"
              }`}
              onClick={() => setActive(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {active === "overall" ? (
        <div className="mt-4 flex items-center justify-between rounded-md bg-[var(--surface-muted)] p-4">
          <span className="font-semibold text-[var(--ink)]">All released marks</span>
          <span className="text-2xl font-black text-[var(--ink)]">{overallScore === null ? "No data" : `${overallScore}%`}</span>
        </div>
      ) : visibleGroups.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {visibleGroups.map((group) => (
            <div key={`${group.kind}-${group.key}`} className="rounded-md border border-[var(--border)] p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-[var(--ink)]">{group.label}</p>
                <Badge tone="accent">{group.attempt_count}</Badge>
              </div>
              <p className="mt-3 text-2xl font-black text-[var(--ink)]">{group.average_released_score}%</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-md bg-[var(--surface-muted)] p-4 text-sm text-[var(--muted)]">
          No released scores are available for this filter yet.
        </p>
      )}
    </div>
  );
}
