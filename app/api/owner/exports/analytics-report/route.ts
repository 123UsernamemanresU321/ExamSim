import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { NextResponse } from "next/server";
import { loadInstitutionCohortAnalytics } from "@/lib/examsim/cohort-analytics-data";
import { getInstitutionPermissionContext } from "@/lib/examsim/institution-roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await getInstitutionPermissionContext();
  if (!context) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!context.permissions.includes("exports")) return NextResponse.json({ error: "Export permission required" }, { status: 403 });
  const reports = await loadInstitutionCohortAnalytics(context.ownerProfileId);
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595.28, 841.89]);
  let y = 795;
  page.drawText("Exam Vault Group Analytics Report", { x: 44, y, size: 18, font: bold, color: rgb(0.04, 0.08, 0.16) });
  y -= 24;
  page.drawText(`Generated ${new Date().toISOString()} | ${reports.length} group(s)`, { x: 44, y, size: 9, font: regular, color: rgb(0.3, 0.35, 0.45) });
  y -= 30;
  for (const report of reports) {
    if (y < 190) { page = pdf.addPage([595.28, 841.89]); y = 795; }
    page.drawText(report.cohortName, { x: 44, y, size: 13, font: bold });
    y -= 18;
    page.drawText(`${report.memberCount} members | ${report.finishedAttemptCount}/${report.attemptCount} completed | average ${format(report.averagePercent)} | marking ${format(report.markingCompletionPercent)} | ${report.atRiskStudentCount} support flag(s)`, { x: 44, y, size: 8.5, font: regular });
    y -= 18;
    const topics = report.topicMastery.slice(0, 4).map((item) => `${item.label}: ${format(item.averagePercent)}`).join(" | ") || "No topic-linked evidence";
    const standards = report.standardMastery.slice(0, 4).map((item) => `${item.label}: ${format(item.averagePercent)}`).join(" | ") || "No standards-linked evidence";
    for (const line of wrap(`Topics: ${topics}`, 100)) { page.drawText(line, { x: 52, y, size: 8.5, font: regular }); y -= 12; }
    for (const line of wrap(`Standards: ${standards}`, 100)) { page.drawText(line, { x: 52, y, size: 8.5, font: regular }); y -= 12; }
    y -= 14;
    page.drawLine({ start: { x: 44, y }, end: { x: 551, y }, thickness: 0.5, color: rgb(0.8, 0.82, 0.86) });
    y -= 18;
  }
  if (!reports.length) page.drawText("No cohort reporting data is available yet.", { x: 44, y, size: 11, font: regular });
  const bytes = await pdf.save();
  const supabase = await createSupabaseServerClient();
  const warnings = reports.length ? [] : ["The report contains no group evidence."];
  const { error } = await supabase.from("export_download_history").insert({ owner_profile_id: context.ownerProfileId, actor_profile_id: context.profileId, export_kind: "cohort_analytics_pdf", format: "PDF", row_count: reports.length, status: warnings.length ? "review_required" : "completed", fidelity_warnings_json: warnings, metadata_json: { generated_at: new Date().toISOString() } });
  if (error) return NextResponse.json({ error: "Could not record export history" }, { status: 500 });
  return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=examsim-group-analytics.pdf", "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" } });
}

function format(value: number | null) { return value === null ? "n/a" : `${Math.round(value)}%`; }
function wrap(value: string, max: number) { const words = value.split(/\s+/); const lines: string[] = []; let line = ""; for (const word of words) { const next = line ? `${line} ${word}` : word; if (next.length > max && line) { lines.push(line); line = word; } else line = next; } if (line) lines.push(line); return lines; }
