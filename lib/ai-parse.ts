import { z } from "zod";
import { normalizedPackageSchema, type NormalizedAssessmentPackage } from "@/lib/assessment-package";
import type { SourceKind } from "@/lib/constants";

export const aiParseSuggestionSchema = z.object({
  normalized_package: normalizedPackageSchema,
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()).default([]),
  review_required: z.literal(true),
});

export type AiParseSuggestion = z.infer<typeof aiParseSuggestionSchema>;

export type DeepSeekParseRequestInput = {
  sourceKind: SourceKind | "mineru";
  title: string;
  sourceText: string;
  model: string;
  existingPackage?: NormalizedAssessmentPackage | null;
  ownerNotes?: string | null;
};

export type DeepSeekChatRequest = {
  model: string;
  response_format: { type: "json_object" };
  temperature: number;
  messages: { role: "system" | "user"; content: string }[];
};

export function normalizeAiParseWarnings(warnings: string[]) {
  const cleaned = warnings.map((warning) => warning.trim()).filter(Boolean);
  if (!cleaned.some((warning) => /owner review/i.test(warning))) {
    cleaned.push("Owner review is mandatory before publish.");
  }
  return [...new Set(cleaned)];
}

export function buildDeepSeekParseRequest(input: DeepSeekParseRequestInput): DeepSeekChatRequest {
  const packageContext = input.existingPackage
    ? `Existing normalized package JSON:\n${JSON.stringify(input.existingPackage, null, 2)}`
    : "No existing normalized package was supplied.";
  const notes = input.ownerNotes?.trim() ? `Owner notes:\n${input.ownerNotes.trim()}` : "No owner notes supplied.";

  return {
    model: input.model,
    response_format: { type: "json_object" },
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content: [
          "You are assisting Exam Vault assessment ingestion.",
          "Return JSON only.",
          "The JSON must contain normalized_package, confidence, warnings, and review_required.",
          "review_required must be true.",
          "Do not invent marks or subquestions silently; use warnings for uncertain structure.",
          "Do not include operational credentials or deployment instructions.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          `Assessment title: ${input.title}`,
          `Source kind: ${input.sourceKind}`,
          notes,
          packageContext,
          "Source text or extracted artifact:",
          input.sourceText.slice(0, 80_000),
        ].join("\n\n"),
      },
    ],
  };
}

export function parseAiSuggestionJson(value: unknown): AiParseSuggestion {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  const suggestion = aiParseSuggestionSchema.parse(parsed);
  return {
    ...suggestion,
    warnings: normalizeAiParseWarnings(suggestion.warnings),
    review_required: true,
  };
}
