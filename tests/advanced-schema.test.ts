import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/202605220001_advanced_development_package.sql", "utf8");

describe("advanced package schema", () => {
  it("enables RLS on new owner-only and student correction tables", () => {
    for (const table of [
      "assessment_health_checks",
      "mistake_categories",
      "mistake_instances",
      "question_bank_items",
      "question_bank_children",
      "generated_papers",
      "generated_paper_items",
      "correction_notebooks",
      "correction_entries",
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("keeps question bank and generated papers owner-managed", () => {
    expect(migration).toContain('create policy "owner manages question bank items"');
    expect(migration).toContain('create policy "owner manages generated papers"');
    expect(migration).not.toContain("student reads question bank");
  });

  it("gates correction notebooks behind released feedback", () => {
    expect(migration).toContain('create policy "student reads own released correction notebooks"');
    expect(migration).toContain("fr.visible_to_student = true");
    expect(migration).toContain("fr.revoked_at is null");
  });
});
