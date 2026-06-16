export type ExamsimLatexQuestion = {
  ordinal: number;
  nodeKey: string;
  marks: number | null;
  topic: string | null;
  answerType: string | null;
  promptLatex: string;
  answerBoxes: string[];
  markscheme: string | null;
  rubricPoints: { code: string | null; text: string; marks: number | null }[];
};

export type ExamsimLatexParseResult = {
  questions: ExamsimLatexQuestion[];
  warnings: string[];
};

type QuestionMarker = {
  index: number;
  marksRaw: string | null;
  metadataRaw: string | null;
};

export function parseExamsimLatex(source: string): ExamsimLatexParseResult {
  const warnings: string[] = [];
  const markers = findQuestionMarkers(source);
  if (!markers.length) {
    return {
      questions: [],
      warnings: ["No \\question[...] markers were found. Add at least one Examsim question marker before importing."],
    };
  }

  const questions = markers.map((marker, index) => {
    const next = markers[index + 1]?.index ?? source.length;
    const block = source.slice(marker.index, next);
    const markerText = source.slice(marker.index, block.indexOf("\n") >= 0 ? marker.index + block.indexOf("\n") : marker.index);
    const contentStart = marker.index + markerText.length;
    const content = source.slice(contentStart, next).trim();
    const metadata = parseMetadata(marker.metadataRaw);
    const marks = parseMarks(marker.marksRaw);
    if (marker.marksRaw && marks === null) warnings.push(`Question ${index + 1}: could not read marks from "${marker.marksRaw}".`);
    if (marks === null) warnings.push(`Question ${index + 1}: marks are missing or unclear.`);

    const answerBoxes = [...content.matchAll(/\\answerbox\{([^}]*)\}/g)].map((match) => match[1]?.trim() || "written");
    const markscheme = extractCommandBlock(content, "markscheme");
    const promptLatex = content
      .replace(/\\answerbox\{[^}]*\}/g, "")
      .replace(/\\markscheme\{[\s\S]*?\}/g, "")
      .trim();
    if (!promptLatex) warnings.push(`Question ${index + 1}: prompt is empty after parsing answer boxes and markscheme.`);

    return {
      ordinal: index + 1,
      nodeKey: `Q${index + 1}`,
      marks,
      topic: metadata.topic ?? null,
      answerType: metadata.type ?? answerBoxes[0] ?? null,
      promptLatex,
      answerBoxes,
      markscheme,
      rubricPoints: parseMarkschemePoints(markscheme),
    };
  });

  return { questions, warnings };
}

function findQuestionMarkers(source: string): QuestionMarker[] {
  const markers: QuestionMarker[] = [];
  const regex = /\\question(?:\[([^\]]*)\])?(?:\[([^\]]*)\])?/g;
  for (const match of source.matchAll(regex)) {
    if (typeof match.index !== "number") continue;
    markers.push({
      index: match.index,
      marksRaw: match[1] ?? null,
      metadataRaw: match[2] ?? null,
    });
  }
  return markers;
}

function parseMarks(value: string | null) {
  if (!value) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseMetadata(value: string | null) {
  const metadata: Record<string, string> = {};
  if (!value) return metadata;
  for (const part of value.split(",")) {
    const [key, ...rest] = part.split("=");
    const normalizedKey = key?.trim().toLowerCase();
    const normalizedValue = rest.join("=").trim();
    if (normalizedKey && normalizedValue) metadata[normalizedKey] = normalizedValue;
  }
  return metadata;
}

function extractCommandBlock(source: string, command: string) {
  const start = source.indexOf(`\\${command}{`);
  if (start < 0) return null;
  let depth = 0;
  for (let index = start + command.length + 1; index < source.length; index += 1) {
    const char = source[index];
    const previous = source[index - 1];
    if (char === "{" && previous !== "\\") depth += 1;
    if (char === "}" && previous !== "\\") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start + command.length + 2, index).trim();
      }
    }
  }
  return null;
}

export function parseMarkschemePoints(markscheme: string | null) {
  if (!markscheme) return [];
  return markscheme
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([A-Z]\d+|M\d+|B\d+|E\d+)\s*:\s*(.+)$/i);
      const code = match?.[1]?.toUpperCase() ?? null;
      const text = match?.[2] ?? line;
      const markMatch = text.match(/\((\d+(?:\.\d+)?)\s*m(?:ark)?s?\)/i);
      return {
        code,
        text: text.replace(/\s*\(\d+(?:\.\d+)?\s*m(?:ark)?s?\)\s*$/i, "").trim(),
        marks: markMatch?.[1] ? Number(markMatch[1]) : code ? 1 : null,
      };
    });
}
