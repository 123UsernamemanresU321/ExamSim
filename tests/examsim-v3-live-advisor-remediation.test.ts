import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Examsim V3 live advisor remediation", () => {
  it("explicitly removes anonymous Paper Mode generator execution", () => {
    const migration = readFileSync(
      "supabase/migrations/20260623082000_fix_paper_mode_booklet_rpc_privileges.sql",
      "utf8",
    );
    expect(migration).toContain(
      "revoke all on function public.institution_generate_paper_mode_booklets(uuid) from public, anon",
    );
    expect(migration).toContain(
      "grant execute on function public.institution_generate_paper_mode_booklets(uuid) to authenticated, service_role",
    );
  });
});
