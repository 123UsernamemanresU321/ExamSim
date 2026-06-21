import { NextResponse } from "next/server";
import { loadInstitutionCohortAnalytics } from "@/lib/examsim/cohort-analytics-data";
import { getInstitutionPermissionContext } from "@/lib/examsim/institution-roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await getInstitutionPermissionContext();
  if (!context) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!context.permissions.includes("exports")) return NextResponse.json({ error: "Export permission required" }, { status: 403 });
  const reports = await loadInstitutionCohortAnalytics(context.ownerProfileId);
  const rows = reports.map((report) => [report.cohortName, report.memberCount, report.attemptCount, report.finishedAttemptCount, format(report.completionPercent), format(report.markingCompletionPercent), format(report.averagePercent), report.atRiskStudentCount, report.topicMastery.slice(0, 5).map((item) => `${item.label} ${Math.round(item.averagePercent)}%`).join("; "), report.standardMastery.slice(0, 5).map((item) => `${item.label} ${Math.round(item.averagePercent)}%`).join("; ")]);
  const csv = [["Group", "Members", "Attempts", "Completed", "Completion", "Marking completion", "Average score", "At-risk students", "Weakest topics", "Standards mastery"], ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv;charset=utf-8", "Content-Disposition": "attachment; filename=examsim-cohort-report.csv", "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" } });
}

function format(value: number | null) { return value === null ? "" : `${Math.round(value)}%`; }
function csvCell(value: unknown) { const raw = value == null ? "" : String(value); const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw; return `"${safe.replaceAll('"', '""')}"`; }
