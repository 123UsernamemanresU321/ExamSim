export type ExportHubAssessment = {
  id: string;
  title: string;
  paper_code: string | null;
  assessment_kind: string;
  created_at: string;
  latest_version_id?: string | null;
  latest_status: string | null;
  parse_confidence: number | null;
  requires_owner_review: boolean | null;
};

export type ExportHubAttempt = {
  id: string;
  title: string;
  paper_code: string | null;
  subject: string | null;
  assessment_kind: string | null;
  student: string;
  start_at_utc: string;
  end_at_utc: string;
  upload_deadline_at_utc: string | null;
  duration_seconds: number;
  state: string;
};

export type ExportHubRosterEntry = {
  id: string;
  student_number: string;
  display_name: string;
  class_group: string | null;
  email: string | null;
  active: boolean;
  created_at: string;
};

export type ExportHubStudent = {
  id: string;
  display_name: string;
  login_code: string;
  activated_at: string | null;
};

export type ExportHubGroup = {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  members: { id: string; display_name: string }[];
};

export type ExportHubDataset = {
  assessments: ExportHubAssessment[];
  attempts: ExportHubAttempt[];
  students: ExportHubStudent[];
  rosterEntries: ExportHubRosterEntry[];
  groups: ExportHubGroup[];
};

export type ExportHubItemStatus = "ready" | "empty" | "edge_export" | "unsupported" | "needs_review";

export type ExportHubItem = {
  key:
    | "markbook_csv"
    | "roster_csv"
    | "cohort_csv"
    | "assessment_inventory_json"
    | "analytics_json"
    | "qti_zip"
    | "moodle_xml";
  title: string;
  format: "CSV" | "JSON" | "ZIP" | "XML";
  status: ExportHubItemStatus;
  rowCount: number;
  filename: string;
  description: string;
  warnings: string[];
};

export function buildExportHubCatalog(dataset: ExportHubDataset): ExportHubItem[] {
  const publishedAssessments = dataset.assessments.filter((assessment) => assessment.latest_status === "published");
  const reviewRequiredAssessments = dataset.assessments.filter((assessment) => assessment.requires_owner_review);
  const finishedAttempts = dataset.attempts.filter((attempt) => isExportableAttemptState(attempt.state));

  return [
    {
      key: "markbook_csv",
      title: "Markbook CSV",
      format: "CSV",
      status: dataset.attempts.length ? "ready" : "empty",
      rowCount: dataset.attempts.length,
      filename: "examsim-markbook.csv",
      description: "Attempt-level export for marks, session state, student identity, timing, and assessment metadata.",
      warnings: finishedAttempts.length < dataset.attempts.length
        ? ["Some attempts are still in progress or unreleased; check release policy before sharing externally."]
        : [],
    },
    {
      key: "roster_csv",
      title: "Student roster CSV",
      format: "CSV",
      status: dataset.rosterEntries.length ? "ready" : dataset.students.length ? "needs_review" : "empty",
      rowCount: dataset.rosterEntries.length || dataset.students.length,
      filename: "examsim-student-roster.csv",
      description: "Student-number roster export for teacher handoff and reconciliation.",
      warnings: dataset.rosterEntries.length ? [] : ["Roster entries are empty; fallback student account rows may not include stable student numbers."],
    },
    {
      key: "cohort_csv",
      title: "Group / cohort CSV",
      format: "CSV",
      status: dataset.groups.length ? "ready" : "empty",
      rowCount: dataset.groups.length,
      filename: "examsim-groups.csv",
      description: "Group membership export for school/cohort reporting checks.",
      warnings: [],
    },
    {
      key: "assessment_inventory_json",
      title: "Assessment inventory JSON",
      format: "JSON",
      status: dataset.assessments.length ? reviewRequiredAssessments.length ? "needs_review" : "ready" : "empty",
      rowCount: dataset.assessments.length,
      filename: "examsim-assessment-inventory.json",
      description: "Structured assessment inventory with parse confidence, status, and review boundary metadata.",
      warnings: reviewRequiredAssessments.length
        ? [`${reviewRequiredAssessments.length} assessment(s) still require owner review before external reuse.`]
        : [],
    },
    {
      key: "analytics_json",
      title: "Analytics handoff JSON",
      format: "JSON",
      status: dataset.attempts.length ? "ready" : "empty",
      rowCount: dataset.attempts.length,
      filename: "examsim-analytics-handoff.json",
      description: "Compact real-data handoff for downstream BI validation and school/cohort reporting.",
      warnings: ["This is a handoff extract, not a replacement for live validation against owner-scoped synthetic records."],
    },
    {
      key: "qti_zip",
      title: "QTI ZIP",
      format: "ZIP",
      status: publishedAssessments.length ? "edge_export" : "needs_review",
      rowCount: publishedAssessments.length,
      filename: "generated-by-qti-export-edge-function.zip",
      description: "Assessment-level QTI export is generated by the existing AAL2-gated Edge Function.",
      warnings: publishedAssessments.length
        ? ["Open a published assessment and run the QTI export from that assessment's review/export controls."]
        : ["Publish and review an assessment before producing a QTI ZIP."],
    },
    {
      key: "moodle_xml",
      title: "Moodle XML",
      format: "XML",
      status: "unsupported",
      rowCount: 0,
      filename: "unsupported-moodle-export.xml",
      description: "Moodle XML remains blocked until feature fidelity and unsupported item warnings are validated.",
      warnings: ["Use normalized JSON or conservative QTI instead; do not claim lossless Moodle XML export yet."],
    },
  ];
}

export function buildMarkbookCsv(attempts: ExportHubAttempt[]) {
  return toCsv(
    ["Assessment", "Paper code", "Subject", "Kind", "Student", "State", "Start UTC", "End UTC", "Upload deadline UTC", "Duration minutes"],
    attempts.map((attempt) => [
      attempt.title,
      attempt.paper_code ?? "",
      attempt.subject ?? "",
      attempt.assessment_kind ?? "",
      attempt.student,
      attempt.state,
      attempt.start_at_utc,
      attempt.end_at_utc,
      attempt.upload_deadline_at_utc ?? "",
      Math.round(attempt.duration_seconds / 60),
    ]),
  );
}

export function buildRosterCsv(entries: ExportHubRosterEntry[] | ExportHubStudent[]) {
  return toCsv(
    ["Student number", "Display name", "Class / group", "Email", "Active", "Created / activated"],
    entries.map((entry) => {
      if ("student_number" in entry) {
        return [
          entry.student_number,
          entry.display_name,
          entry.class_group ?? "",
          entry.email ?? "",
          entry.active ? "active" : "inactive",
          entry.created_at,
        ];
      }
      return [entry.login_code, entry.display_name, "", "", entry.activated_at ? "activated" : "pending", entry.activated_at ?? ""];
    }),
  );
}

export function buildCohortReportCsv(groups: ExportHubGroup[]) {
  return toCsv(
    ["Group", "Description", "Member count", "Members"],
    groups.map((group) => [
      group.name,
      group.description ?? "",
      group.member_count,
      group.members.map((member) => member.display_name).join("; "),
    ]),
  );
}

export function buildAssessmentInventoryJson(assessments: ExportHubAssessment[], generatedAt = new Date()) {
  return stableJson({
    generated_at: generatedAt.toISOString(),
    fidelity_warnings: [
      "Moodle XML is not exported from this hub until unsupported-feature mapping is validated.",
      "QTI ZIP generation remains assessment-scoped through the existing Edge Function.",
    ],
    assessments: assessments.map((assessment) => ({
      id: assessment.id,
      title: assessment.title,
      paper_code: assessment.paper_code,
      assessment_kind: assessment.assessment_kind,
      latest_status: assessment.latest_status,
      parse_confidence: assessment.parse_confidence,
      requires_owner_review: assessment.requires_owner_review,
      created_at: assessment.created_at,
    })),
  });
}

export function buildAnalyticsHandoffJson(dataset: ExportHubDataset, generatedAt = new Date()) {
  return stableJson({
    generated_at: generatedAt.toISOString(),
    counts: {
      assessments: dataset.assessments.length,
      attempts: dataset.attempts.length,
      students: dataset.students.length,
      roster_entries: dataset.rosterEntries.length,
      groups: dataset.groups.length,
    },
    attempts_by_state: countBy(dataset.attempts, (attempt) => attempt.state),
    assessments_by_status: countBy(dataset.assessments, (assessment) => assessment.latest_status ?? "draft"),
    groups: dataset.groups.map((group) => ({
      id: group.id,
      name: group.name,
      member_count: group.member_count,
    })),
    warnings: [
      "Released student-facing analytics must still be filtered by feedback release state before student display.",
      "School/cohort reporting should be validated on the actual website with synthetic records for cross-workspace isolation before launch.",
    ],
  });
}

export function buildExportFile(key: ExportHubItem["key"], dataset: ExportHubDataset) {
  switch (key) {
    case "markbook_csv":
      return { filename: "examsim-markbook.csv", mimeType: "text/csv;charset=utf-8", content: buildMarkbookCsv(dataset.attempts) };
    case "roster_csv":
      return {
        filename: "examsim-student-roster.csv",
        mimeType: "text/csv;charset=utf-8",
        content: buildRosterCsv(dataset.rosterEntries.length ? dataset.rosterEntries : dataset.students),
      };
    case "cohort_csv":
      return { filename: "examsim-groups.csv", mimeType: "text/csv;charset=utf-8", content: buildCohortReportCsv(dataset.groups) };
    case "assessment_inventory_json":
      return { filename: "examsim-assessment-inventory.json", mimeType: "application/json;charset=utf-8", content: buildAssessmentInventoryJson(dataset.assessments) };
    case "analytics_json":
      return { filename: "examsim-analytics-handoff.json", mimeType: "application/json;charset=utf-8", content: buildAnalyticsHandoffJson(dataset) };
    default:
      return null;
  }
}

function toCsv(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>) {
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\n");
}

function csvCell(value: string | number | boolean | null | undefined) {
  const raw = value == null ? "" : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function stableJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function countBy<T>(items: T[], key: (item: T) => string) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = key(item);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function isExportableAttemptState(state: string) {
  return ["FINISHED_REVIEW", "SUBMITTED", "RETURNED", "FINALIZED"].includes(state);
}
