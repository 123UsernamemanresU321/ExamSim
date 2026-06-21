import { describe, expect, it } from "vitest";
import {
  buildAssessmentInventoryJson,
  buildCohortReportCsv,
  buildExportHubCatalog,
  buildMarkbookCsv,
  buildRosterCsv,
} from "@/lib/examsim/export-hub";

const baseDataset = {
  assessments: [
    {
      id: "assessment-1",
      title: "Chemistry Mock",
      paper_code: "CHEM-P2",
      assessment_kind: "exam",
      created_at: "2026-06-01T00:00:00Z",
      latest_version_id: "version-1",
      latest_status: "published",
      parse_confidence: 0.91,
      requires_owner_review: false,
    },
  ],
  attempts: [
    {
      id: "attempt-1",
      title: "Chemistry Mock",
      paper_code: "CHEM-P2",
      subject: "Chemistry",
      assessment_kind: "exam",
      student: "=cmd|' /C calc'!A0",
      start_at_utc: "2026-06-02T08:00:00Z",
      end_at_utc: "2026-06-02T10:00:00Z",
      upload_deadline_at_utc: null,
      duration_seconds: 7200,
      state: "FINISHED_REVIEW" as const,
    },
  ],
  students: [
    {
      id: "student-1",
      display_name: "Ada Lovelace",
      login_code: "DP1-001",
      activated_at: "2026-06-01T10:00:00Z",
    },
  ],
  rosterEntries: [
    {
      id: "roster-1",
      student_number: "DP1-001",
      display_name: "Ada Lovelace",
      class_group: "DP1",
      email: "ada@example.test",
      active: true,
      created_at: "2026-06-01T00:00:00Z",
    },
  ],
  groups: [
    {
      id: "group-1",
      name: "DP1 Chemistry",
      description: "Higher level group",
      member_count: 1,
      members: [{ id: "student-1", display_name: "Ada Lovelace" }],
    },
  ],
};

describe("V3 Export Hub", () => {
  it("builds an honest export catalog with ready, edge, and unsupported states", () => {
    const catalog = buildExportHubCatalog(baseDataset);
    expect(catalog.find((item) => item.key === "markbook_csv")?.status).toBe("ready");
    expect(catalog.find((item) => item.key === "assessment_inventory_json")?.status).toBe("ready");
    expect(catalog.find((item) => item.key === "qti_zip")?.status).toBe("edge_export");
    expect(catalog.find((item) => item.key === "moodle_xml")?.status).toBe("edge_export");
    expect(catalog.find((item) => item.key === "moodle_xml")?.warnings.join(" ")).toContain("not lossless");
  });

  it("exports CSV using spreadsheet-injection-safe cells", () => {
    const csv = buildMarkbookCsv(baseDataset.attempts);
    expect(csv).toContain("Chemistry Mock");
    expect(csv).toContain("\"'=cmd|' /C calc'!A0\"");
    expect(csv).not.toContain("\n=cmd");
  });

  it("exports roster and cohort reports without relying on hidden JSON editing", () => {
    expect(buildRosterCsv(baseDataset.rosterEntries)).toContain("DP1-001");
    expect(buildCohortReportCsv(baseDataset.groups)).toContain("DP1 Chemistry");
    expect(buildCohortReportCsv(baseDataset.groups)).toContain("Ada Lovelace");
  });

  it("exports assessment inventory JSON with fidelity warnings for unsupported formats", () => {
    const parsed = JSON.parse(buildAssessmentInventoryJson(baseDataset.assessments, new Date("2026-06-17T00:00:00Z")));
    expect(parsed.generated_at).toBe("2026-06-17T00:00:00.000Z");
    expect(parsed.assessments[0].paper_code).toBe("CHEM-P2");
    expect(parsed.fidelity_warnings).toContain("Moodle XML is not exported from this hub until unsupported-feature mapping is validated.");
  });
});
