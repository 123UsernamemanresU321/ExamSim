import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

function recoveryMigration() {
  const file = readdirSync("supabase/migrations").find((name) => name.includes("fix_curriculum_review_atomicity"));
  expect(file).toBeTruthy();
  return readFileSync(`supabase/migrations/${file}`, "utf8");
}

describe("V3 curriculum review recovery", () => {
  it("allows status-only updates for safe legacy owner-scoped PDF paths", () => {
    const migration = recoveryMigration();
    expect(migration).toContain("tg_op = 'UPDATE' and new.object_path = old.object_path");
    expect(migration).toContain("new.object_path like new.owner_profile_id::text || '/%'");
    expect(migration).toContain("new.object_path like new.owner_profile_id::text || '/curriculum/%'");
    expect(migration).toContain("new.object_path like new.owner_profile_id::text || '/resources/%'");
    expect(migration).toContain("position('..' in new.object_path) = 0");
  });

  it("reviews nodes and finalizes their source documents atomically and idempotently", () => {
    const migration = recoveryMigration();
    const actions = readFileSync("app/owner/standards/actions.ts", "utf8");
    expect(migration).toContain("create or replace function public.institution_review_curriculum_standards");
    expect(migration).toContain("for update");
    expect(migration).toContain("review_status = p_decision");
    expect(migration).toContain("status = 'ready'");
    expect(migration).toContain("public.has_institution_permission(p_owner_profile_id, 'assessment_authoring')");
    expect(migration).toContain("revoke all on function public.institution_review_curriculum_standards");
    expect(actions).toContain('.rpc("institution_review_curriculum_standards"');
    expect(actions).not.toContain('from("curriculum_standards").update({\n    review_status: decision');
  });
});
