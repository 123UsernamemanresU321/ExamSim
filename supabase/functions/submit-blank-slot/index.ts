import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { computeAttemptState } from "../_shared/attempt-state.ts";
import { profileForAuthUser, requireUser } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import { verifyStateToken } from "../_shared/state-token.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireUser(request);
    const profile = await profileForAuthUser(user.id);
    const body = await readJson<{ attempt_id: string; question_node_id?: string; question_node_key?: string; state_token: string }>(request);
    const tokenPayload = await verifyStateToken(body.state_token);
    if (tokenPayload.attempt_id !== body.attempt_id || tokenPayload.profile_id !== profile.id) {
      return json({ error: "State token does not match this attempt" }, 403);
    }
    const { data: attempt, error } = await admin.from("attempts").select("*").eq("id", body.attempt_id).single();
    if (error) throw error;
    if (attempt.assignee_profile_id !== profile.id) return json({ error: "Forbidden" }, 403);
    const { data: assessment } = await admin
      .from("assessments")
      .select("title,paper_code")
      .eq("id", attempt.assessment_id)
      .maybeSingle();
    const state = computeAttemptState({
      serverNowUtc: new Date().toISOString(),
      startAtUtc: attempt.start_at_utc,
      endAtUtc: attempt.end_at_utc,
      uploadDeadlineAtUtc: attempt.upload_deadline_at_utc,
      solutionsRequested: attempt.solutions_requested,
    });
    if (state !== "ACTIVE" && state !== "UPLOAD_ONLY") return json({ error: "Blank submission not allowed in current state", state }, 403);
    let resolvedQuestionNodeId = body.question_node_id ?? null;
    if (body.question_node_key) {
      const { data: node, error: nodeError } = await admin
        .from("question_nodes")
        .select("id")
        .eq("assessment_version_id", attempt.assessment_version_id)
        .eq("node_key", body.question_node_key)
        .maybeSingle();
      if (nodeError) throw nodeError;
      resolvedQuestionNodeId = node?.id ?? resolvedQuestionNodeId;
    }
    if (!resolvedQuestionNodeId) return json({ error: "question_node_id or question_node_key is required" }, 400);

    const { data: slot, error: slotError } = await admin
      .from("upload_slots")
      .select("id,status,locked_at")
      .eq("attempt_id", body.attempt_id)
      .eq("question_node_id", resolvedQuestionNodeId)
      .single();
    if (slotError) throw slotError;
    if (slot.status === "uploaded" || slot.locked_at) return json({ error: "Upload slot already has a file" }, 409);
    const { data: questionNode } = await admin
      .from("question_nodes")
      .select("node_key,display_label")
      .eq("id", resolvedQuestionNodeId)
      .maybeSingle();

    const submittedAt = new Date().toISOString();
    const questionLabel = safeQuestionLabel(questionNode?.display_label ?? questionNode?.node_key ?? body.question_node_key ?? "Question");
    const placeholderFileName = `Blank Placeholder - ${questionLabel}.pdf`;
    const bytes = await createBlankPlaceholderPdf({
      assessmentTitle: assessment?.title ?? "Assessment",
      paperCode: assessment?.paper_code ?? null,
      attemptId: body.attempt_id,
      questionLabel,
      uploadSlotId: slot.id,
      submittedAt,
    });
    const objectPath = `attempts/${body.attempt_id}/${resolvedQuestionNodeId}/blank-placeholder.pdf`;
    const { error: uploadError } = await admin.storage.from("answer-uploads").upload(objectPath, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (uploadError) throw uploadError;

    const { error: updateError } = await admin
      .from("upload_slots")
      .update({
        object_path: objectPath,
        uploaded_at: submittedAt,
        is_blank_placeholder: true,
        status: "blank_placeholder",
        confirmed_by_profile_id: profile.id,
        original_file_name: placeholderFileName,
        file_size_bytes: bytes.byteLength,
        content_type: "application/pdf",
        locked_at: submittedAt,
      })
      .eq("attempt_id", body.attempt_id)
      .eq("question_node_id", resolvedQuestionNodeId);
    if (updateError) throw updateError;
    await admin.from("attempt_events").insert({
      attempt_id: body.attempt_id,
      event_type: "upload.blank_placeholder_submitted",
      payload_json: {
        question_node_id: resolvedQuestionNodeId,
        question_node_key: body.question_node_key ?? questionNode?.node_key ?? null,
        upload_slot_id: slot.id,
        object_path: objectPath,
        file_name: placeholderFileName,
      },
    });
    return json({ ok: true, object_path: objectPath, file_name: placeholderFileName, file_size_bytes: bytes.byteLength });
  } catch (error) {
    return errorResponse(error, "submit-blank-slot failed");
  }
});

type BlankPlaceholderPdfInput = {
  assessmentTitle: string;
  paperCode: string | null;
  attemptId: string;
  questionLabel: string;
  uploadSlotId: string;
  submittedAt: string;
};

async function createBlankPlaceholderPdf(input: BlankPlaceholderPdfInput) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const navy = rgb(0.074, 0.106, 0.18);
  const blue = rgb(0.192, 0.42, 0.953);
  const ink = rgb(0.06, 0.09, 0.16);
  const muted = rgb(0.38, 0.45, 0.55);
  const border = rgb(0.85, 0.89, 0.94);
  const surface = rgb(0.972, 0.98, 0.988);

  page.drawRectangle({ x: 0, y: height - 88, width, height: 88, color: navy });
  page.drawText("EXAM VAULT", { x: 48, y: height - 44, size: 11, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Student blank submission record", { x: 48, y: height - 66, size: 10, font, color: rgb(0.78, 0.82, 0.9) });
  page.drawText("BLANK", { x: width - 140, y: height - 50, size: 18, font: bold, color: rgb(1, 1, 1) });

  page.drawText("Blank Placeholder", { x: 48, y: height - 146, size: 28, font: bold, color: ink });
  page.drawText("The student explicitly submitted this question as blank.", { x: 48, y: height - 174, size: 12, font, color: muted });

  page.drawRectangle({ x: 48, y: height - 330, width: width - 96, height: 118, color: surface, borderColor: border, borderWidth: 1 });
  drawInfoRow(page, bold, font, "Assessment", safePdfText(input.assessmentTitle, 52), 72, height - 244, ink, muted);
  drawInfoRow(page, bold, font, "Paper code", input.paperCode ? safePdfText(input.paperCode, 64) : "Not specified", 72, height - 272, ink, muted);
  drawInfoRow(page, bold, font, "Question", input.questionLabel, 72, height - 300, ink, muted);

  page.drawRectangle({ x: 48, y: height - 500, width: width - 96, height: 116, color: rgb(1, 1, 1), borderColor: border, borderWidth: 1 });
  page.drawRectangle({ x: 48, y: height - 500, width: 6, height: 116, color: blue });
  page.drawText("Marker note", { x: 72, y: height - 422, size: 13, font: bold, color: ink });
  const noteLines = [
    "This generated PDF confirms the platform received a deliberate blank submission.",
    "It is not a missing upload, lost write-up, or failed file transfer.",
    "Mark this question according to the assessment policy for blank responses.",
  ];
  noteLines.forEach((line, index) => {
    page.drawText(line, { x: 72, y: height - 450 - index * 20, size: 10.5, font, color: muted });
  });

  page.drawText("Submission evidence", { x: 48, y: 178, size: 12, font: bold, color: ink });
  drawEvidenceLine(page, bold, font, "Submitted at", input.submittedAt, 48, 152, ink, muted);
  drawEvidenceLine(page, bold, font, "Attempt ID", input.attemptId, 48, 128, ink, muted);
  drawEvidenceLine(page, bold, font, "Upload slot ID", input.uploadSlotId, 48, 104, ink, muted);

  page.drawLine({ start: { x: 48, y: 70 }, end: { x: width - 48, y: 70 }, thickness: 1, color: border });
  page.drawText("Generated by Exam Vault. Original student uploads remain private and immutable.", {
    x: 48,
    y: 48,
    size: 9,
    font,
    color: muted,
  });

  return await pdfDoc.save({ useObjectStreams: false });
}

function drawInfoRow(page: any, bold: any, font: any, label: string, value: string, x: number, y: number, ink: any, muted: any) {
  page.drawText(label.toUpperCase(), { x, y, size: 8, font: bold, color: muted });
  page.drawText(value, { x: x + 112, y: y - 1, size: 11, font, color: ink });
}

function drawEvidenceLine(page: any, bold: any, font: any, label: string, value: string, x: number, y: number, ink: any, muted: any) {
  page.drawText(`${label}:`, { x, y, size: 9.5, font: bold, color: ink });
  page.drawText(value, { x: x + 96, y, size: 9.5, font, color: muted });
}

function safeQuestionLabel(value: string) {
  const cleaned = safePdfText(value, 80).replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || "Question";
}

function safePdfText(value: string, maxLength: number) {
  const cleaned = value.replace(/[^\x20-\x7e]/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}
