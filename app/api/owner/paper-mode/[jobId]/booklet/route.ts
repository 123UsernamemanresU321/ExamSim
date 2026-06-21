import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { NextResponse } from "next/server";
import { getInstitutionPermissionContext } from "@/lib/examsim/institution-roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const context = await getInstitutionPermissionContext();
  if (!context) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!context.permissions.includes("assessment_authoring") && !context.permissions.includes("marking")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const supabase = await createSupabaseServerClient();
  const { data: job, error: jobError } = await supabase.from("paper_mode_jobs").select("*,assessments(title,paper_code,subject)").eq("id", jobId).eq("owner_profile_id", context.ownerProfileId).maybeSingle();
  if (jobError) throw jobError;
  if (!job) return NextResponse.json({ error: "Paper Mode job not found" }, { status: 404 });
  const [{ data: booklets, error: bookletError }, { data: questions, error: questionError }] = await Promise.all([
    supabase.from("paper_mode_booklets").select("*").eq("paper_mode_job_id", job.id).order("student_number_snapshot"),
    supabase.from("question_nodes").select("id,node_key,display_label,prompt_html,prompt_latex,marks,ordinal_path").eq("assessment_version_id", job.assessment_version_id).in("node_type", ["question", "subquestion", "part"]).order("ordinal_path"),
  ]);
  if (bookletError) throw bookletError;
  if (questionError) throw questionError;
  if (!booklets?.length) return NextResponse.json({ error: "Generate roster booklets before downloading the pack" }, { status: 409 });
  if (booklets.length > 250) return NextResponse.json({ error: "A single booklet pack is limited to 250 students" }, { status: 413 });

  const assessment = Array.isArray(job.assessments) ? job.assessments[0] : job.assessments;
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const booklet of booklets) {
    let page = pdf.addPage([595.28, 841.89]);
    let y = drawHeader(page, bold, regular, {
      title: assessment?.title ?? job.title,
      paperCode: assessment?.paper_code ?? null,
      studentName: booklet.student_name_snapshot,
      studentNumber: booklet.student_number_snapshot,
      bookletCode: booklet.booklet_code,
      durationMinutes: Math.round(job.duration_seconds / 60),
      instructions: job.instructions,
    });
    for (const question of questions ?? []) {
      const prompt = cleanText(question.prompt_html || question.prompt_latex || "Question prompt available in the source paper.");
      const lines = wrapText(`${question.display_label ?? question.node_key}  ${prompt}`, regular, 10.5, 500);
      const requiredHeight = 28 + lines.length * 14 + Math.max(48, Math.min(150, Number(question.marks ?? 1) * 18));
      if (y - requiredHeight < 55) {
        addFooter(page, regular, booklet.booklet_code, pdf.getPageCount());
        page = pdf.addPage([595.28, 841.89]);
        y = 795;
      }
      page.drawText(`${question.display_label ?? question.node_key}  [${question.marks ?? 0} marks]`, { x: 46, y, size: 11, font: bold, color: rgb(0.06, 0.09, 0.16) });
      y -= 18;
      for (const line of lines) {
        page.drawText(line, { x: 46, y, size: 10.5, font: regular, color: rgb(0.12, 0.16, 0.24) });
        y -= 14;
      }
      const answerLines = Math.max(3, Math.min(8, Number(question.marks ?? 1) + 2));
      y -= 4;
      for (let line = 0; line < answerLines; line += 1) {
        page.drawLine({ start: { x: 46, y }, end: { x: 548, y }, thickness: 0.5, color: rgb(0.72, 0.75, 0.8) });
        y -= 19;
      }
      y -= 12;
    }
    addFooter(page, regular, booklet.booklet_code, pdf.getPageCount());
  }
  const bytes = await pdf.save();
  const fileName = `${safeFileName(job.title)}-booklets.pdf`;
  return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${fileName}"`, "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" } });
}

function drawHeader(page: PDFPage, bold: PDFFont, regular: PDFFont, details: { title: string; paperCode: string | null; studentName: string; studentNumber: string | null; bookletCode: string; durationMinutes: number; instructions: string | null }) {
  page.drawText(details.title, { x: 46, y: 796, size: 17, font: bold, color: rgb(0.04, 0.08, 0.16) });
  page.drawText(`${details.paperCode ?? "Paper Mode"} | ${details.durationMinutes} minutes`, { x: 46, y: 775, size: 9.5, font: regular, color: rgb(0.28, 0.34, 0.44) });
  page.drawRectangle({ x: 46, y: 694, width: 502, height: 62, borderWidth: 1, borderColor: rgb(0.25, 0.35, 0.55) });
  page.drawText(`Student: ${details.studentName}`, { x: 58, y: 732, size: 11, font: bold });
  page.drawText(`Student number: ${details.studentNumber ?? "Not assigned"}`, { x: 58, y: 713, size: 10, font: regular });
  page.drawText(`Booklet ID: ${details.bookletCode}`, { x: 330, y: 722, size: 10, font: bold });
  let y = 674;
  if (details.instructions) for (const line of wrapText(cleanText(details.instructions), regular, 9.5, 500).slice(0, 5)) { page.drawText(line, { x: 46, y, size: 9.5, font: regular }); y -= 13; }
  return y - 12;
}

function addFooter(page: PDFPage, font: PDFFont, bookletCode: string, pageNumber: number) {
  page.drawText(`${bookletCode} | page ${pageNumber}`, { x: 46, y: 28, size: 8, font, color: rgb(0.35, 0.4, 0.48) });
}

function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) current = candidate;
    else { if (current) lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function cleanText(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
}

function safeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "paper-mode";
}
