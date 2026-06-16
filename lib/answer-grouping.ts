import { parseStoredResponseValue } from "@/lib/response-values";

export type AnswerGroupingInput = {
  id: string;
  question_node_id: string;
  attempt_id: string;
  answer_text: string | null;
  response_mode?: string | null;
};

export type AnswerGroup = {
  key: string;
  label: string;
  normalized_answer: string;
  count: number;
  response_ids: string[];
  attempt_ids: string[];
  confidence: "exact" | "normalized" | "manual_review";
};

export function groupSimilarAnswers(responses: AnswerGroupingInput[]): AnswerGroup[] {
  const groups = new Map<string, AnswerGroup>();
  for (const response of responses) {
    const normalized = normalizeAnswer(response.answer_text, response.response_mode);
    const key = `${response.question_node_id}:${normalized || "blank"}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.response_ids.push(response.id);
      existing.attempt_ids.push(response.attempt_id);
      continue;
    }
    groups.set(key, {
      key,
      label: normalized ? readableAnswer(response.answer_text, response.response_mode) : "Blank or unreadable",
      normalized_answer: normalized,
      count: 1,
      response_ids: [response.id],
      attempt_ids: [response.attempt_id],
      confidence: normalized ? confidenceFor(response.answer_text, normalized, response.response_mode) : "manual_review",
    });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function normalizeAnswer(answerText: string | null | undefined, responseMode?: string | null) {
  if (!answerText) return "";
  const parsed = parseStoredResponseValue(answerText);
  if (parsed.kind === "numerical") return normalizeNumeric(parsed.value);
  if (parsed.kind === "multiple_choice") return parsed.choiceIds.map((choice: string) => choice.trim().toUpperCase()).sort().join(",");
  const raw = parsed.text ?? String(answerText);
  if (responseMode === "numerical") return normalizeNumeric(raw);
  return raw
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[.,;:!?]+$/g, "")
    .trim();
}

function normalizeNumeric(value: string) {
  const cleaned = value.trim().replace(/,/g, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return cleaned.toLowerCase().replace(/\s+/g, " ");
  return String(Number(parsed.toPrecision(12)));
}

function readableAnswer(answerText: string | null | undefined, responseMode?: string | null) {
  if (!answerText) return "Blank or unreadable";
  const parsed = parseStoredResponseValue(answerText);
  const raw = parsed.kind === "numerical"
    ? parsed.value
    : parsed.kind === "multiple_choice"
      ? parsed.choiceIds.join(", ")
      : parsed.text;
  return responseMode === "numerical" ? normalizeNumeric(raw) : raw.trim().slice(0, 120) || "Blank or unreadable";
}

function confidenceFor(answerText: string | null | undefined, normalized: string, responseMode?: string | null): AnswerGroup["confidence"] {
  if (responseMode === "numerical") return "normalized";
  const raw = String(answerText ?? "").trim();
  return raw === normalized ? "exact" : "normalized";
}
