import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

type PdfAnnotation = {
  id: string;
  type: "ink" | "highlight" | "text" | "stamp" | "rectangle" | "circle" | "arrow" | "comment";
  page_index: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  size?: number;
  points?: { x: number; y: number }[];
  text?: string;
  comment?: string;
  stamp?: "tick" | "cross" | "question";
  style?: {
    stroke?: string;
    fill?: string;
    color?: string;
    stroke_width?: number;
    opacity?: number;
    font_size?: number;
  };
};

type Body = {
  attempt_id: string;
  question_node_id: string;
  upload_slot_id: string;
  annotations: PdfAnnotation[];
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireOwnerAal2(request);
    const ownerProfile = await profileForAuthUser(user.id);
    const body = await readJson<Body>(request);
    if (!body.attempt_id || !body.question_node_id || !body.upload_slot_id) {
      return json({ error: "attempt_id, question_node_id, and upload_slot_id are required" }, 400);
    }
    if (!Array.isArray(body.annotations)) return json({ error: "annotations must be an array" }, 400);

    const { attempt, slot } = await loadOwnedContext(admin, ownerProfile.id, body);
    if (!slot.object_path) return json({ error: "Upload slot has no submitted PDF" }, 400);

    const { data: sourceBlob, error: downloadError } = await admin.storage.from("answer-uploads").download(slot.object_path);
    if (downloadError) throw downloadError;
    if (!sourceBlob) throw new Error("Could not download source PDF");

    const pdfDoc = await PDFDocument.load(await sourceBlob.arrayBuffer(), { ignoreEncryption: true });
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = pdfDoc.getPages();

    for (const annotation of body.annotations) {
      const page = pages[annotation.page_index];
      if (!page) continue;
      drawAnnotation(page, annotation, font);
    }

    const bytes = await pdfDoc.save({ useObjectStreams: false });
    const objectPath = `${ownerProfile.id}/attempts/${attempt.id}/annotated/${slot.id}-${Date.now()}.pdf`;
    const { error: uploadError } = await admin.storage.from("marking-packets").upload(objectPath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { error: updateError } = await admin
      .from("upload_slots")
      .update({ annotated_object_path: objectPath, annotated_generated_at: new Date().toISOString() })
      .eq("id", slot.id)
      .eq("attempt_id", attempt.id);
    if (updateError) throw updateError;

    const { data: signed } = await admin.storage.from("marking-packets").createSignedUrl(objectPath, 300);

    await auditOwnerAction(ownerProfile.id, user.id, "annotated_pdf.generated", "attempts", attempt.id, {
      question_node_id: body.question_node_id,
      upload_slot_id: slot.id,
      object_path: objectPath,
      annotation_count: body.annotations.length,
    });

    return json({ ok: true, object_path: objectPath, signed_url: signed?.signedUrl ?? null, expires_in_seconds: 300 });
  } catch (error) {
    return errorResponse(error, "generate-annotated-pdf failed");
  }
});

async function loadOwnedContext(admin: any, ownerProfileId: string, body: Body) {
  const { data: attempt, error: attemptError } = await admin
    .from("attempts")
    .select("id, assessment_id, assessment_version_id")
    .eq("id", body.attempt_id)
    .single();
  if (attemptError) throw attemptError;

  const { data: assessment, error: assessmentError } = await admin
    .from("assessments")
    .select("owner_profile_id")
    .eq("id", attempt.assessment_id)
    .single();
  if (assessmentError) throw assessmentError;
  if (assessment.owner_profile_id !== ownerProfileId) throw new Error("Forbidden");

  const { data: node, error: nodeError } = await admin
    .from("question_nodes")
    .select("id")
    .eq("id", body.question_node_id)
    .eq("assessment_version_id", attempt.assessment_version_id)
    .single();
  if (nodeError) throw nodeError;
  if (!node?.id) throw new Error("Question node not found");

  const { data: slot, error: slotError } = await admin
    .from("upload_slots")
    .select("id, attempt_id, question_node_id, object_path")
    .eq("id", body.upload_slot_id)
    .eq("attempt_id", attempt.id)
    .eq("question_node_id", body.question_node_id)
    .single();
  if (slotError) throw slotError;
  if (!slot?.id) throw new Error("Upload slot not found");

  return { attempt, slot };
}

function drawAnnotation(page: any, annotation: PdfAnnotation, font: any) {
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const color = parseColor(annotation.style?.stroke ?? annotation.style?.color ?? "#cc0000");
  const strokeWidth = Math.max(0.5, Number(annotation.style?.stroke_width ?? 2));
  const opacity = clamp(Number(annotation.style?.opacity ?? 1), 0.15, 1);

  if ((annotation.type === "ink" || annotation.type === "highlight") && annotation.points?.length) {
    const points = annotation.points.map((point) => toPdfPoint(point, pageWidth, pageHeight));
    for (let index = 1; index < points.length; index += 1) {
      page.drawLine({
        start: points[index - 1],
        end: points[index],
        thickness: annotation.type === "highlight" ? Math.max(9, strokeWidth) : strokeWidth,
        color: annotation.type === "highlight" ? rgb(0.98, 0.78, 0.08) : color,
        opacity: annotation.type === "highlight" ? 0.38 : opacity,
      });
    }
    return;
  }

  const x = clamp(annotation.x ?? 0, 0, 1) * pageWidth;
  const browserY = clamp(annotation.y ?? 0, 0, 1) * pageHeight;
  const boxWidth = Math.max(8, clamp(annotation.width ?? 0.08, 0, 1) * pageWidth);
  const boxHeight = Math.max(8, clamp(annotation.height ?? 0.04, 0, 1) * pageHeight);
  const y = pageHeight - browserY - boxHeight;

  if (annotation.type === "rectangle") {
    page.drawRectangle({ x, y, width: boxWidth, height: boxHeight, borderColor: color, borderWidth: strokeWidth, opacity: 0, borderOpacity: opacity });
    return;
  }

  if (annotation.type === "circle") {
    page.drawEllipse({
      x: x + boxWidth / 2,
      y: y + boxHeight / 2,
      xScale: boxWidth / 2,
      yScale: boxHeight / 2,
      borderColor: color,
      borderWidth: strokeWidth,
      opacity: 0,
      borderOpacity: opacity,
    });
    return;
  }

  if (annotation.type === "arrow") {
    page.drawLine({ start: { x, y: pageHeight - browserY }, end: { x: x + boxWidth, y }, thickness: strokeWidth, color, opacity });
    page.drawLine({ start: { x: x + boxWidth, y }, end: { x: x + boxWidth - 8, y: y + 4 }, thickness: strokeWidth, color, opacity });
    page.drawLine({ start: { x: x + boxWidth, y }, end: { x: x + boxWidth - 4, y: y + 8 }, thickness: strokeWidth, color, opacity });
    return;
  }

  if (annotation.type === "stamp") {
    const symbol = annotation.stamp === "cross" ? "X" : annotation.stamp === "question" ? "?" : "✓";
    const size = annotation.style?.font_size
      ? clamp(Number(annotation.style.font_size), 8, 72)
      : Math.max(16, clamp(annotation.size ?? 0.04, 0.01, 0.12) * Math.min(pageWidth, pageHeight));
    page.drawText(symbol, { x: x - size / 3, y: pageHeight - browserY - size / 2, size, font, color, opacity });
    return;
  }

  const text = (annotation.type === "comment" ? annotation.comment : annotation.text) || "";
  if (text.trim()) {
    const fontSize = clamp(Number(annotation.style?.font_size ?? 10), 7, 48);
    page.drawRectangle({ x, y, width: boxWidth, height: boxHeight, color: rgb(1, 1, 1), opacity: 0.82, borderColor: color, borderWidth: 0.8 });
    page.drawText(text.slice(0, 240), {
      x: x + 4,
      y: y + boxHeight - fontSize - 4,
      size: fontSize,
      font,
      color,
      maxWidth: Math.max(20, boxWidth - 8),
      lineHeight: fontSize + 2,
      opacity,
    });
  }
}

function toPdfPoint(point: { x: number; y: number }, pageWidth: number, pageHeight: number) {
  return {
    x: clamp(point.x, 0, 1) * pageWidth,
    y: pageHeight - clamp(point.y, 0, 1) * pageHeight,
  };
}

function parseColor(hex: string) {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "cc0000";
  return rgb(parseInt(normalized.slice(0, 2), 16) / 255, parseInt(normalized.slice(2, 4), 16) / 255, parseInt(normalized.slice(4, 6), 16) / 255);
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
