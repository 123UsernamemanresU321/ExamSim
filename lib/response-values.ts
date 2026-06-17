import type { QuestionNode, NormalizedAssessmentPackage } from "@/lib/assessment-package";
import type { Json, QuestionNodeRow } from "@/types/database";

export type ParsedResponseValue =
  | { kind: "typed"; text: string }
  | { kind: "multiple_choice"; choiceIds: string[] }
  | { kind: "numerical"; value: string }
  | { kind: "table"; cells: Record<string, string> }
  | { kind: "whiteboard"; strokes: WhiteboardStroke[]; snapshotDataUrl?: string };

export type WhiteboardStroke = {
  id: string;
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
};

type ChoiceLike = {
  choice_id?: unknown;
  id?: unknown;
  content_html?: unknown;
  text?: unknown;
  content?: unknown;
};

type InteractionLike = {
  choices?: unknown;
};

type QuestionWithInteraction =
  | QuestionNode
  | (QuestionNodeRow & { interaction_json?: Json | null })
  | Pick<QuestionNode, "interaction">;

export function serializeChoiceResponse(choiceIds: string[]) {
  return JSON.stringify({
    kind: "multiple_choice",
    choice_ids: choiceIds,
  });
}

export function serializeNumericalResponse(value: string) {
  return JSON.stringify({
    kind: "numerical",
    value,
  });
}

export function serializeTableResponse(value: { cells: Record<string, string> }) {
  return JSON.stringify({
    kind: "table",
    cells: sanitizeCellMap(value.cells),
  });
}

export function serializeWhiteboardResponse(value: { strokes: WhiteboardStroke[]; snapshotDataUrl?: string }) {
  return JSON.stringify({
    kind: "whiteboard",
    strokes: sanitizeStrokes(value.strokes),
    snapshot_data_url: typeof value.snapshotDataUrl === "string" ? value.snapshotDataUrl : undefined,
  });
}

export function parseStoredResponseValue(answerText: string | null | undefined): ParsedResponseValue {
  const raw = answerText ?? "";
  if (!raw.trim()) return { kind: "typed", text: "" };

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isRecord(parsed)) {
      const kind = stringValue(parsed.kind);
      if (kind === "multiple_choice" || kind === "choice") {
        const rawIds = Array.isArray(parsed.choice_ids)
          ? parsed.choice_ids
          : Array.isArray(parsed.choiceIds)
            ? parsed.choiceIds
            : [];
        return {
          kind: "multiple_choice",
          choiceIds: rawIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0),
        };
      }
      if (kind === "numerical" || kind === "numeric") {
        const value = parsed.value;
        return {
          kind: "numerical",
          value: typeof value === "number" ? String(value) : typeof value === "string" ? value : "",
        };
      }
      if (kind === "table") {
        return {
          kind: "table",
          cells: isRecord(parsed.cells) ? sanitizeCellMap(parsed.cells) : {},
        };
      }
      if (kind === "whiteboard") {
        return {
          kind: "whiteboard",
          strokes: Array.isArray(parsed.strokes) ? sanitizeStrokes(parsed.strokes) : [],
          snapshotDataUrl: typeof parsed.snapshot_data_url === "string" ? parsed.snapshot_data_url : undefined,
        };
      }
    }
  } catch {
    // Plain typed answers from older attempts remain valid.
  }

  return { kind: "typed", text: raw };
}

export function formatStoredResponse(answerText: string | null | undefined, question?: QuestionWithInteraction) {
  const parsed = parseStoredResponseValue(answerText);
  if (parsed.kind === "multiple_choice") {
    const labels = choiceLabels(question);
    const rendered = parsed.choiceIds.map((id) => labels.get(id) ?? id).join(", ");
    return `Selected choice${parsed.choiceIds.length === 1 ? "" : "s"}: ${rendered || "None selected"}`;
  }
  if (parsed.kind === "numerical") {
    const unit = numericalUnit(question);
    return `Numerical answer: ${parsed.value || "No value"}${unit ? ` ${unit}` : ""}`;
  }
  if (parsed.kind === "table") {
    const count = Object.values(parsed.cells).filter((value) => value.trim().length > 0).length;
    return `Table response: ${count} filled cell${count === 1 ? "" : "s"}`;
  }
  if (parsed.kind === "whiteboard") {
    return `Whiteboard response: ${parsed.strokes.length} stroke${parsed.strokes.length === 1 ? "" : "s"}`;
  }
  return parsed.text;
}

export function extractPackageResponseModes(pkg: NormalizedAssessmentPackage) {
  return pkg.questions.flatMap((node) => [node.response_mode, ...extractChildModes(node.children ?? [])]);
}

function extractChildModes(nodes: QuestionNode[]): QuestionNode["response_mode"][] {
  return nodes.flatMap((node) => [node.response_mode, ...extractChildModes(node.children ?? [])]);
}

function choiceLabels(question?: QuestionWithInteraction) {
  const interaction = readInteraction(question);
  const choices = Array.isArray(interaction?.choices) ? interaction.choices : [];
  const labels = new Map<string, string>();
  choices.forEach((choice) => {
    const record = isRecord(choice) ? choice as ChoiceLike : {};
    const id = stringValue(record.choice_id) ?? stringValue(record.id);
    const content = stringValue(record.content_html) ?? stringValue(record.text) ?? stringValue(record.content);
    if (id) labels.set(id, stripMarkup(content ?? id));
  });
  return labels;
}

function numericalUnit(question?: QuestionWithInteraction) {
  const interaction = readInteraction(question);
  return typeof interaction?.unit === "string" ? interaction.unit : "";
}

function readInteraction(question?: QuestionWithInteraction): (InteractionLike & Record<string, unknown>) | null {
  if (!question) return null;
  if ("interaction" in question && isRecord(question.interaction)) return question.interaction as InteractionLike & Record<string, unknown>;
  if ("interaction_json" in question && isRecord(question.interaction_json)) return question.interaction_json as InteractionLike & Record<string, unknown>;
  return null;
}

function sanitizeCellMap(value: Record<string, unknown>): Record<string, string> {
  const entries = Object.entries(value)
    .filter(([key]) => key.length > 0 && key.length <= 120)
    .map(([key, cellValue]) => [key, typeof cellValue === "number" ? String(cellValue) : typeof cellValue === "string" ? cellValue.slice(0, 2000) : ""]);
  return Object.fromEntries(entries);
}

function sanitizeStrokes(value: unknown[]): WhiteboardStroke[] {
  return value.slice(0, 500).flatMap((stroke, index) => {
    if (!isRecord(stroke)) return [];
    const points = Array.isArray(stroke.points)
      ? stroke.points.slice(0, 2000).flatMap((point) => {
          if (!isRecord(point)) return [];
          const x = typeof point.x === "number" ? clamp01(point.x) : null;
          const y = typeof point.y === "number" ? clamp01(point.y) : null;
          return x === null || y === null ? [] : [{ x, y }];
        })
      : [];
    if (points.length === 0) return [];
    return [{
      id: stringValue(stroke.id) ?? `stroke-${index + 1}`,
      color: normalizeColor(stringValue(stroke.color) ?? "#111827"),
      width: normalizeWidth(stroke.width),
      points,
    }];
  });
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeWidth(value: unknown) {
  const width = typeof value === "number" && Number.isFinite(value) ? value : 2;
  return Math.min(16, Math.max(1, width));
}

function normalizeColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#111827";
}

function stripMarkup(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
