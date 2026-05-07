export type ParsedAiJsonObject = {
  value: Record<string, unknown>;
  warnings: string[];
};

export function parseAiJsonObject(content: string): ParsedAiJsonObject {
  const warnings: string[] = [];
  const trimmed = stripMarkdownFence(content.trim());
  const direct = tryParseJson(trimmed);
  const directRecord = coerceRecord(direct, warnings);
  if (directRecord) return { value: directRecord, warnings };

  const extracted = extractFirstBalancedObject(trimmed);
  if (!extracted) {
    throw new Error("AI response was not valid JSON. Try again, reduce the source size, or add clearer owner notes.");
  }

  if (extracted.before.trim() || extracted.after.trim()) {
    warnings.push("AI response included text outside JSON; Exam Vault used only the first complete JSON object.");
  }

  const parsed = tryParseJson(extracted.json);
  const record = coerceRecord(parsed, warnings);
  if (!record) {
    throw new Error("AI response JSON was not an object with a normalized package proposal.");
  }
  return { value: record, warnings };
}

function stripMarkdownFence(value: string) {
  const fenced = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : value;
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

function coerceRecord(value: unknown, warnings: string[]): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (typeof value === "string" && value.trim()) {
    warnings.push("AI response returned JSON as a string; Exam Vault parsed the nested JSON string.");
    return parseAiJsonObject(value).value;
  }
  return null;
}

function extractFirstBalancedObject(value: string) {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (start === -1) {
      if (char === "{") {
        start = index;
        depth = 1;
      }
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) {
      return {
        before: value.slice(0, start),
        json: value.slice(start, index + 1),
        after: value.slice(index + 1),
      };
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
