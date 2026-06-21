import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Examsim V3 Paper Mode", () => {
  it("defines owner-scoped jobs, personalized booklets, private scans, and page mappings", () => {
    const file = readdirSync("supabase/migrations").find((name) => name.includes("v3_paper_mode"));
    expect(file).toBeTruthy();
    const migration = readFileSync(`supabase/migrations/${file}`, "utf8");
    for (const table of ["paper_mode_jobs", "paper_mode_booklets", "paper_mode_scans", "paper_mode_scan_pages"]) expect(migration).toContain(`public.${table}`);
    expect(migration).toContain("paper-scans");
    expect(migration).toContain("public.has_institution_permission");
    expect(migration).not.toMatch(/public\s*=\s*true/i);
  });

  it("issues and confirms scan uploads through owner-scoped Edge functions", () => {
    for (const name of ["owner-issue-paper-scan-upload", "owner-confirm-paper-scan-upload"]) {
      const path = `supabase/functions/${name}/index.ts`;
      expect(existsSync(path), `${name} exists`).toBe(true);
      const source = readFileSync(path, "utf8");
      expect(source).toContain("requireInstitutionAal2");
      expect(source).toContain("paper_mode_jobs");
      expect(source).toContain("paper-scans");
    }
    expect(readFileSync("supabase/functions/owner-confirm-paper-scan-upload/index.ts", "utf8")).toContain("verifyPrivatePdfUpload");
  });

  it("provides printable identifiers, scan upload, manual mapping, and marking links", () => {
    const index = readFileSync("app/owner/paper-mode/page.tsx", "utf8");
    const detail = readFileSync("app/owner/paper-mode/[jobId]/page.tsx", "utf8");
    const actions = readFileSync("app/owner/paper-mode/[jobId]/actions.ts", "utf8");
    const pdfRoute = readFileSync("app/api/owner/paper-mode/[jobId]/booklet/route.ts", "utf8");
    expect(index).toContain("Paper Mode");
    expect(detail).toContain("Manual mapping queue");
    expect(detail).toContain("PaperScanUploadPanel");
    expect(actions).toContain("mapPaperScanPageAction");
    expect(actions).toContain("attempt_id");
    expect(actions).toContain("question_node_id");
    expect(pdfRoute).toContain("PDFDocument");
    expect(pdfRoute).toContain("booklet_code");
    expect(detail).toContain("Mark attempt");
  });

  it("keeps automated OCR/barcode mapping honest", () => {
    const detail = readFileSync("app/owner/paper-mode/[jobId]/page.tsx", "utf8");
    expect(detail).toContain("Automatic scan mapping is not configured");
    expect(detail).toContain("manual mapping");
  });
});
