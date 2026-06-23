import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

function migrationSource() {
  const file = readdirSync("supabase/migrations").find((name) => name.includes("v3_exam_resources_curriculum"));
  expect(file).toBeTruthy();
  return readFileSync(`supabase/migrations/${file}`, "utf8");
}

describe("V3 exam resources and curriculum schema", () => {
  it("creates owner-scoped resource and curriculum provenance tables with RLS", () => {
    const migration = migrationSource();
    for (const table of [
      "resource_library_items",
      "assessment_tool_policies",
      "curriculum_source_documents",
      "curriculum_import_jobs",
    ]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("resource_library_item_id");
    expect(migration).toContain("exam_policy_json");
    expect(migration).toContain("review_status");
    expect(migration).toContain("source_page_start");
    expect(migration).toContain("source_page_end");
  });

  it("creates private PDF-only buckets without anonymous or student storage policies", () => {
    const migration = migrationSource();
    expect(migration).toContain("'assessment-resources', 'assessment-resources', false");
    expect(migration).toContain("'curriculum-sources', 'curriculum-sources', false");
    expect(migration).toContain("array['application/pdf']::text[]");
    expect(migration).not.toMatch(/to anon[\s\S]{0,200}(assessment-resources|curriculum-sources)/i);
    expect(migration).not.toMatch(/student[^;]*(assessment-resources|curriculum-sources)/i);
  });

  it("grants the authenticated role explicitly and keeps management institution-scoped", () => {
    const migration = migrationSource();
    expect(migration).toContain("grant select, insert, update, delete on public.resource_library_items to authenticated");
    expect(migration).toContain("grant select, insert, update, delete on public.assessment_tool_policies to authenticated");
    expect(migration).toContain("public.has_institution_permission(owner_profile_id, 'assessment_authoring')");
    expect(migration).not.toContain("grant select on public.resource_library_items to anon");
  });

  it("prevents policy and material mutation after an assessment version is published", () => {
    const migration = migrationSource();
    expect(migration).toContain("prevent_published_exam_policy_mutation");
    expect(migration).toContain("Published assessment policy is immutable");
    expect(migration).toContain("assessment_materials_policy_immutable");
    expect(migration).toContain("assessment_tool_policies_immutable");
  });

  it("keeps legacy materials as allowed while adding requirement and resource linkage", () => {
    const migration = migrationSource();
    expect(migration).toContain("add column if not exists requirement text not null default 'allowed'");
    expect(migration).toContain("check (requirement in ('allowed', 'required'))");
    expect(migration).toContain("references public.resource_library_items(id)");
  });
});
