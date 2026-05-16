import type { Json, WorkAnnotation } from "@/types/database";

export type AnnotationTool =
  | "select"
  | "pen"
  | "highlighter"
  | "text"
  | "tick"
  | "cross"
  | "question"
  | "rectangle"
  | "circle"
  | "arrow"
  | "comment"
  | "eraser";

export type PdfAnnotationType = "ink" | "highlight" | "text" | "stamp" | "rectangle" | "circle" | "arrow" | "comment";

export type NormalizedPoint = {
  x: number;
  y: number;
};

export type PdfAnnotationStyle = {
  stroke?: string;
  fill?: string;
  color?: string;
  stroke_width?: number;
  opacity?: number;
  font_size?: number;
};

export type PdfAnnotation = {
  id: string;
  persistedId?: string;
  type: PdfAnnotationType;
  page_index: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  size?: number;
  points?: NormalizedPoint[];
  text?: string;
  comment?: string;
  stamp?: "tick" | "cross" | "question";
  style: PdfAnnotationStyle;
  visibility: "private" | "student_visible";
  severity: "note" | "minor" | "major" | "critical";
  created_at: string;
  updated_at: string;
};

export type AnnotationAnchorV2 = {
  schema_version: "annotation-v2";
  page_index: number;
  pdf_width?: number | null;
  pdf_height?: number | null;
  annotation: PdfAnnotation;
};

export function createAnnotationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `ann_${crypto.randomUUID()}`;
  return `ann_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function annotationBody(annotation: PdfAnnotation) {
  if (annotation.text?.trim()) return annotation.text.trim();
  if (annotation.comment?.trim()) return annotation.comment.trim();
  if (annotation.type === "stamp") return `${annotation.stamp ?? "Stamp"} annotation`;
  if (annotation.type === "ink") return "Pen annotation";
  if (annotation.type === "highlight") return "Highlighter annotation";
  if (annotation.type === "rectangle") return "Rectangle annotation";
  if (annotation.type === "circle") return "Circle annotation";
  if (annotation.type === "arrow") return "Arrow annotation";
  return "Work annotation";
}

export function isAnnotationAnchorV2(value: unknown): value is AnnotationAnchorV2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.schema_version === "annotation-v2" && typeof record.annotation === "object" && record.annotation !== null;
}

export function anchorForAnnotation(annotation: PdfAnnotation, pdfSize?: { width: number; height: number } | null): AnnotationAnchorV2 {
  return {
    schema_version: "annotation-v2",
    page_index: annotation.page_index,
    pdf_width: pdfSize?.width ?? null,
    pdf_height: pdfSize?.height ?? null,
    annotation,
  };
}

export function annotationFromWorkAnnotation(row: WorkAnnotation): PdfAnnotation {
  if (isAnnotationAnchorV2(row.anchor_json)) {
    return {
      ...(row.anchor_json.annotation as PdfAnnotation),
      persistedId: row.id,
      id: row.id,
      visibility: row.visibility,
      severity: row.severity,
      text: (row.anchor_json.annotation as PdfAnnotation).text ?? row.body,
      updated_at: row.updated_at,
    };
  }

  const legacy = readLegacyAnchor(row.anchor_json);
  const now = row.updated_at ?? new Date().toISOString();
  return {
    id: row.id,
    persistedId: row.id,
    type: legacy.annotation_tool === "circle" ? "circle" : legacy.annotation_tool === "rectangle" ? "rectangle" : legacy.annotation_tool === "sketch" ? "ink" : legacy.annotation_tool === "text_box" ? "text" : "comment",
    page_index: Math.max(0, (legacy.page ?? 1) - 1),
    x: percentToUnit(legacy.x ?? 0.06),
    y: percentToUnit(legacy.y ?? 0.06),
    width: percentToUnit(legacy.width ?? 18),
    height: percentToUnit(legacy.height ?? 8),
    points: legacy.points?.map((point) => ({ x: percentToUnit(point.x), y: percentToUnit(point.y) })),
    text: row.body,
    comment: row.body,
    style: {
      stroke: legacy.color ?? "#cc0000",
      color: legacy.color ?? "#cc0000",
      stroke_width: 2,
      opacity: 1,
      fill: "transparent",
    },
    visibility: row.visibility,
    severity: row.severity,
    created_at: row.created_at,
    updated_at: now,
  };
}

function readLegacyAnchor(anchor: Json): {
  annotation_tool?: "note" | "text_box" | "rectangle" | "circle" | "sketch";
  page?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
  points?: { x: number; y: number }[];
} {
  if (!anchor || typeof anchor !== "object" || Array.isArray(anchor)) return {};
  return anchor as ReturnType<typeof readLegacyAnchor>;
}

function percentToUnit(value: number) {
  return Math.max(0, Math.min(1, value > 1 ? value / 100 : value));
}
