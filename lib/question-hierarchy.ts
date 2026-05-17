export type DocumentSectionType =
  | "cover"
  | "instructions"
  | "formula_sheet"
  | "contents"
  | "question_page"
  | "markscheme_cover"
  | "markscheme_instructions"
  | "markscheme_question_page"
  | "unknown";

export type HierarchyKeyLike = {
  node_key: string;
  ordinal?: number | null;
  ordinal_path?: number[] | null;
  source_page_start?: number | null;
};

export function canonicalQuestionKey(rawKey: string | null | undefined): string {
  if (!rawKey) return "";
  return rawKey
    .trim()
    .replace(/\s+/g, "")
    .replace(/[.:]+$/g, "")
    .replace(/^(question|problem|q)(\d+)/i, "$2")
    .replace(/^question/i, "")
    .replace(/^problem/i, "")
    .replace(/^q(?=\d)/i, "")
    .replace(/^(\d+)([a-z])$/i, "$1($2)")
    .toLowerCase();
}

export function ordinalPathForQuestionKey(rawKey: string | null | undefined, fallbackOrdinal?: number | null): number[] {
  const key = canonicalQuestionKey(rawKey);
  const rootMatch = key.match(/^(\d+)/);
  const path: number[] = [];

  if (rootMatch) {
    path.push(Number(rootMatch[1]));
    const partMatches = [...key.matchAll(/\(([^()]+)\)/g)];
    partMatches.forEach((match, index) => {
      path.push(questionPartTokenToOrdinal(match[1] ?? "", index + 1));
    });
  }

  if (!path.length && typeof fallbackOrdinal === "number" && Number.isFinite(fallbackOrdinal)) {
    path.push(Math.max(0, fallbackOrdinal));
  }

  return path;
}

export function resolvedOrdinalPath(node: HierarchyKeyLike, fallbackIndex = 0): number[] {
  if (Array.isArray(node.ordinal_path) && node.ordinal_path.every((part) => Number.isFinite(part))) {
    return node.ordinal_path.map((part) => Math.trunc(part));
  }
  const parsed = ordinalPathForQuestionKey(node.node_key, node.ordinal ?? fallbackIndex + 1);
  return parsed.length ? parsed : [fallbackIndex + 1];
}

export function compareOrdinalPaths(a: number[], b: number[]): number {
  const maxLength = Math.max(a.length, b.length);
  for (let index = 0; index < maxLength; index += 1) {
    const left = a[index];
    const right = b[index];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (left !== right) return left - right;
  }
  return 0;
}

export function compareQuestionLike(a: HierarchyKeyLike, b: HierarchyKeyLike): number {
  const pathCompare = compareOrdinalPaths(resolvedOrdinalPath(a), resolvedOrdinalPath(b));
  if (pathCompare !== 0) return pathCompare;

  const pageA = a.source_page_start ?? Number.MAX_SAFE_INTEGER;
  const pageB = b.source_page_start ?? Number.MAX_SAFE_INTEGER;
  if (pageA !== pageB) return pageA - pageB;

  return canonicalQuestionKey(a.node_key).localeCompare(canonicalQuestionKey(b.node_key), "en", {
    numeric: true,
    sensitivity: "base",
  });
}

export function parentPathForOrdinalPath(path: number[]): number[] | null {
  return path.length > 1 ? path.slice(0, -1) : null;
}

export function formatQuestionKeyFromOrdinalPath(path: number[]): string {
  if (!path.length) return "";
  const [root, ...parts] = path;
  return `${root}${parts.map((part, index) => `(${formatPartOrdinal(part, index + 1)})`).join("")}`;
}

export function formatQuestionDisplayLabel(path: number[]): string {
  if (path.length === 1) return `Q${path[0]}`;
  return formatQuestionKeyFromOrdinalPath(path);
}

export function isRootQuestionKey(rawKey: string | null | undefined): boolean {
  return ordinalPathForQuestionKey(rawKey).length === 1;
}

export function classifyDocumentSection(text: string, purpose: "paper" | "markscheme" = "paper"): DocumentSectionType {
  const compact = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (!compact) return "unknown";

  const hasQuestionMarker = hasActualQuestionMarker(text);
  const hasMarkschemeMarker = /\b(mark\s*scheme|markscheme|marking\s+instructions?|award\s+marks?|marking\s+notes?)\b/i.test(text);
  const hasFormulaMarker = /\b(formula\s+sheet|formula\s+booklet|formulae|mathematical\s+formulae)\b/i.test(text);
  const hasInstructionMarker = /\b(instructions?\s+to\s+candidates?|do\s+not\s+open|answer\s+all\s+questions|write\s+your\s+answers?|working\s+must\s+be\s+shown|total\s+marks|time\s+allowed)\b/i.test(text);
  const hasCoverMarker = /\b(candidate\s+name|centre\s+number|paper\s+\d|copyright|turn\s+over|international\s+baccalaureate|olympiad|examination)\b/i.test(text);

  if (purpose === "markscheme" || hasMarkschemeMarker) {
    if (hasQuestionMarker && !/\b(general\s+marking|marking\s+instructions?|award\s+marks?\s+according\s+to)\b/i.test(text)) {
      return "markscheme_question_page";
    }
    if (/\b(general\s+marking|marking\s+instructions?|award\s+marks?\s+according\s+to|follow\s+through|method\s+marks?)\b/i.test(text)) {
      return "markscheme_instructions";
    }
    if (hasCoverMarker || /\b(mark\s*scheme|markscheme)\b/i.test(text)) return "markscheme_cover";
  }

  if (hasFormulaMarker) return "formula_sheet";
  if (hasQuestionMarker) return "question_page";
  if (hasInstructionMarker) return "instructions";
  if (/\b(contents|table\s+of\s+contents)\b/i.test(text)) return "contents";
  if (hasCoverMarker) return "cover";
  return "unknown";
}

export function shouldExcludeFromQuestionExtraction(text: string, purpose: "paper" | "markscheme" = "paper"): boolean {
  return new Set<DocumentSectionType>([
    "cover",
    "instructions",
    "formula_sheet",
    "contents",
    "markscheme_cover",
    "markscheme_instructions",
  ]).has(classifyDocumentSection(text, purpose));
}

export function matchQuestionKey(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = canonicalQuestionKey(a);
  const right = canonicalQuestionKey(b);
  return Boolean(left && right && left === right);
}

function hasActualQuestionMarker(text: string): boolean {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.some((line) => {
    if (/^(question|problem|q)\s*\d{1,2}\b/i.test(line)) return true;
    if (/^\d{1,2}[\).]\s+(?!marks?\b|points?\b|minutes?\b)[A-Za-z0-9$\\(]/.test(line)) return true;
    if (/^\d{1,2}\s+\([a-z]\)\s+/i.test(line)) return true;
    return false;
  });
}

function questionPartTokenToOrdinal(rawToken: string, depth: number): number {
  const token = rawToken.trim().toLowerCase();
  if (/^\d+$/.test(token)) return Number(token);
  if (/^[ivxlcdm]+$/.test(token) && depth >= 2) return romanToNumber(token);
  if (/^[a-z]$/.test(token)) return token.charCodeAt(0) - 96;
  if (/^[ivxlcdm]+$/.test(token)) return romanToNumber(token);
  return 9999;
}

function formatPartOrdinal(value: number, depth: number): string {
  if (depth === 1) return numberToLetters(value).toLowerCase();
  if (depth === 2) return numberToRoman(value).toLowerCase();
  if (depth === 3) return numberToLetters(value).toUpperCase();
  return String(value);
}

function numberToLetters(value: number): string {
  let n = Math.max(1, Math.trunc(value));
  let label = "";
  while (n > 0) {
    n -= 1;
    label = String.fromCharCode(97 + (n % 26)) + label;
    n = Math.floor(n / 26);
  }
  return label;
}

export function romanToNumber(raw: string): number {
  const values: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  const chars = raw.toLowerCase().split("");
  let total = 0;
  for (let index = 0; index < chars.length; index += 1) {
    const current = values[chars[index]!] ?? 0;
    const next = values[chars[index + 1]!] ?? 0;
    total += current < next ? -current : current;
  }
  return total;
}

function numberToRoman(value: number): string {
  const pairs: Array<[number, string]> = [
    [1000, "m"],
    [900, "cm"],
    [500, "d"],
    [400, "cd"],
    [100, "c"],
    [90, "xc"],
    [50, "l"],
    [40, "xl"],
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ];
  let remaining = Math.max(1, Math.trunc(value));
  let out = "";
  for (const [amount, symbol] of pairs) {
    while (remaining >= amount) {
      out += symbol;
      remaining -= amount;
    }
  }
  return out;
}
