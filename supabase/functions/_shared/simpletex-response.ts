const MAX_RESULT_CHARS = 200_000;
const MAX_DEPTH = 8;
const TEXT_KEYS = new Set(["content", "text", "markdown", "md"]);
const LATEX_KEYS = new Set(["latex", "formula"]);
const CONTAINER_KEYS = new Set(["info", "data", "result", "results", "blocks", "lines", "items", "regions", "paragraphs", "cells"]);

export function normalizeSimpleTexResponse(result: unknown) {
  const textParts: string[] = [];
  const latexParts: string[] = [];
  visit(result, 0, null, textParts, latexParts);
  return {
    text: joinParts(textParts),
    latex: joinParts(latexParts),
  };
}

function visit(
  value: unknown,
  depth: number,
  parentKey: string | null,
  textParts: string[],
  latexParts: string[],
) {
  if (depth > MAX_DEPTH || textParts.join("\n\n").length + latexParts.join("\n\n").length >= MAX_RESULT_CHARS) return;
  if (typeof value === "string") {
    const cleaned = value.trim();
    if (!cleaned) return;
    if (parentKey && LATEX_KEYS.has(parentKey)) latexParts.push(cleaned);
    else if (parentKey && (TEXT_KEYS.has(parentKey) || CONTAINER_KEYS.has(parentKey))) textParts.push(cleaned);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 1_000)) visit(item, depth + 1, parentKey, textParts, latexParts);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase();
    if (TEXT_KEYS.has(normalizedKey) || LATEX_KEYS.has(normalizedKey) || CONTAINER_KEYS.has(normalizedKey)) {
      visit(child, depth + 1, normalizedKey, textParts, latexParts);
    }
  }
}

function joinParts(parts: string[]) {
  const unique = Array.from(new Set(parts)).join("\n\n").slice(0, MAX_RESULT_CHARS).trim();
  return unique || null;
}
