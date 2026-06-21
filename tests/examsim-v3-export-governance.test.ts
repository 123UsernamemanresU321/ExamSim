import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Examsim V3 export governance", () => {
  it("stores owner-scoped export download history", () => {
    const file = readdirSync("supabase/migrations").find((name) => name.includes("v3_export_governance"));
    expect(file).toBeTruthy();
    const migration = readFileSync(`supabase/migrations/${file}`, "utf8");
    expect(migration).toContain("public.export_download_history");
    expect(migration).toContain("public.has_institution_permission");
    expect(migration).not.toMatch(/to anon/i);
  });

  it("provides permission-checked audited downloads and a real analytics PDF", () => {
    expect(existsSync("app/api/owner/exports/log/route.ts")).toBe(true);
    expect(existsSync("app/api/owner/exports/analytics-report/route.ts")).toBe(true);
    const pdf = readFileSync("app/api/owner/exports/analytics-report/route.ts", "utf8");
    expect(pdf).toContain("PDFDocument");
    expect(pdf).toContain('permissions.includes("exports")');
    expect(pdf).toContain("private, no-store");
  });

  it("keeps Moodle XML conservative and records fidelity warnings", () => {
    const path = "supabase/functions/moodle-export-assessment/index.ts";
    expect(existsSync(path)).toBe(true);
    const source = readFileSync(path, "utf8");
    expect(source).toContain('requireInstitutionAal2(request, "exports")');
    expect(source).toContain("fidelity_warnings");
    expect(source).toContain("review_required");
    expect(source).toContain("export_download_history");
  });
});
