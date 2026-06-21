import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rankRevisionCandidates } from "@/lib/examsim/adaptive-revision";

describe("Examsim V3 adaptive revision", () => {
  it("ranks ready questions against missed topics and standards", () => {
    const ranked = rankRevisionCandidates({
      weaknesses: [{ key: "mechanics", kind: "topic", lossRatio: 0.8 }, { key: "ib-aa-hl-2.1", kind: "standard", lossRatio: 0.6 }],
      candidates: [
        { id: "q1", tags: ["mechanics"], curriculum_standard_ids: [], estimated_difficulty: 0.5, readiness_status: "ready", do_not_reuse: false },
        { id: "q2", tags: [], curriculum_standard_ids: ["ib-aa-hl-2.1"], estimated_difficulty: 0.7, readiness_status: "ready", do_not_reuse: false },
        { id: "q3", tags: ["mechanics"], curriculum_standard_ids: [], estimated_difficulty: 0.2, readiness_status: "needs_review", do_not_reuse: false },
      ],
    });
    expect(ranked.map((item) => item.id)).toEqual(["q1", "q2"]);
    expect(ranked[0]?.reason).toContain("mechanics");
  });

  it("stores owner-reviewed assignments and exposes student data through a checked RPC", () => {
    const file = readdirSync("supabase/migrations").find((name) => name.includes("v3_adaptive_revision"));
    expect(file).toBeTruthy();
    const migration = readFileSync(`supabase/migrations/${file}`, "utf8");
    for (const table of ["revision_sets", "revision_set_items", "revision_set_assignments"]) expect(migration).toContain(`public.${table}`);
    expect(migration).toContain("student_revision_assignments_safe");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("public.has_institution_permission");
    expect(migration).not.toMatch(/question_bank_items.*for select to authenticated[\s\S]*using \(true\)/i);
  });

  it("provides teacher review and released student practice routes", () => {
    expect(existsSync("app/owner/revision/page.tsx")).toBe(true);
    expect(existsSync("app/owner/revision/[setId]/page.tsx")).toBe(true);
    expect(existsSync("app/student/revision/page.tsx")).toBe(true);
    const actions = readFileSync("app/owner/revision/actions.ts", "utf8");
    expect(actions).toContain("generateRevisionSetAction");
    expect(actions).toContain("assignRevisionSetAction");
    expect(actions).toContain("feedback_releases");
  });
});
