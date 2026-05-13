import type { QuestionNode, NormalizedAssessmentPackage } from "@/lib/assessment-package";
import type { Json, QuestionNodeRow } from "@/types/database";

export type ParsedResponseValue =
  | { kind: "typed"; text: string }
  | { kind: "multiple_choice"; choiceIds: string[] }
  | { kind: "numerical"; value: string };

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

function stripMarkup(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
