"use client";

import katex from "katex";

export function formatPromptContent({ latex, html }: { latex?: string; html?: string }) {
  if (html) return formatHtmlPromptContent(unescapeMath(html));
  if (!latex) return "";

  const normalized = unescapeMath(latex).replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";

  return formatPromptLines(normalized.split("\n"));
}

function formatHtmlPromptContent(html: string) {
  if (!html.trim()) return "";

  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return formatPromptLines(html.replace(/\r\n/g, "\n").split("\n"));
  }

  return html.replace(/<p([^>]*)>([\s\S]*?)<\/p>/gi, (_match, attrs: string, body: string) => {
    const text = body.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").trim();
    if (text.includes("\t")) return formatPromptLine(text);
    if (hasBareLatexCommand(text) || looksLikeBareMath(text)) return `<p${attrs}>${formatPromptSegment(text)}</p>`;
    return `<p${attrs}>${body}</p>`;
  });
}

export function MathRenderer({ latex, html, className }: { latex?: string; html?: string; className?: string }) {
  const content = renderMathMarkup(formatPromptContent({ latex, html }));

  if (!content) return null;

  return (
    <div
      className={["ev-math-content", className].filter(Boolean).join(" ")}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}

export function renderMathMarkup(content: string) {
  if (!content) return "";

  const preparedContent = renderDelimiterFreeMathDivs(content);
  let rendered = "";
  let index = 0;

  while (index < preparedContent.length) {
    const next = findNextMathDelimiter(preparedContent, index);
    if (!next) {
      rendered += preparedContent.slice(index);
      break;
    }

    rendered += preparedContent.slice(index, next.start);
    const close = findClosingDelimiter(preparedContent, next.contentStart, next.close);
    if (close === -1) {
      rendered += preparedContent.slice(next.start);
      break;
    }

    const source = preparedContent.slice(next.contentStart, close);
    rendered += renderKatex(source, next.display, preparedContent.slice(next.start, close + next.close.length));
    index = close + next.close.length;
  }

  return rendered;
}

type MathDelimiter = {
  start: number;
  contentStart: number;
  close: "$$" | "$" | "\\]" | "\\)";
  display: boolean;
};

function findNextMathDelimiter(content: string, from: number): MathDelimiter | null {
  const candidates: MathDelimiter[] = [];
  const displayDollar = content.indexOf("$$", from);
  if (displayDollar !== -1) {
    candidates.push({ start: displayDollar, contentStart: displayDollar + 2, close: "$$", display: true });
  }

  const displayBracket = content.indexOf("\\[", from);
  if (displayBracket !== -1) {
    candidates.push({ start: displayBracket, contentStart: displayBracket + 2, close: "\\]", display: true });
  }

  const inlineParen = content.indexOf("\\(", from);
  if (inlineParen !== -1) {
    candidates.push({ start: inlineParen, contentStart: inlineParen + 2, close: "\\)", display: false });
  }

  const inlineDollar = findInlineDollar(content, from);
  if (inlineDollar !== -1) {
    candidates.push({ start: inlineDollar, contentStart: inlineDollar + 1, close: "$", display: false });
  }

  return candidates.sort((a, b) => a.start - b.start)[0] ?? null;
}

function findInlineDollar(content: string, from: number) {
  for (let i = from; i < content.length; i += 1) {
    if (content[i] !== "$") continue;
    if (content[i - 1] === "\\" || content[i + 1] === "$" || content[i - 1] === "$") continue;
    return i;
  }
  return -1;
}

function findClosingDelimiter(content: string, from: number, close: MathDelimiter["close"]) {
  for (let i = from; i < content.length; i += 1) {
    if (content.startsWith(close, i) && content[i - 1] !== "\\") return i;
  }
  return -1;
}

function renderKatex(source: string, displayMode: boolean, fallback: string) {
  try {
    return katex.renderToString(source, {
      displayMode,
      throwOnError: false,
      strict: "warn",
      trust: false,
    });
  } catch {
    return fallback;
  }
}

function renderDelimiterFreeMathDivs(content: string) {
  return content.replace(
    /<div([^>]*\bclass=(["'])[^"']*\bmath\b[^"']*\2[^>]*)>([\s\S]*?)<\/div>/gi,
    (match, attrs: string, _quote: string, body: string) => {
      if (hasMathDelimiters(body)) return match;

      const source = unescapeHtml(body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      if (!source || !looksLikeBareMath(source)) return match;

      const normalized = normalizeBareMathSource(source);
      return `<div${attrs}>${renderKatex(normalized, true, escapeHtml(source))}</div>`;
    },
  );
}

function formatPromptLines(lines: string[]) {
  let output = "";
  let index = 0;

  while (index < lines.length) {
    const table = collectTableBlock(lines, index);
    if (table) {
      output += renderPromptTable(table.rows);
      index = table.endIndex;
      continue;
    }

    output += formatPromptLine(lines[index] ?? "");
    index += 1;
  }

  return output;
}

type TableBlock = {
  rows: string[][];
  endIndex: number;
};

function collectTableBlock(lines: string[], startIndex: number): TableBlock | null {
  const rows: string[][] = [];
  let index = startIndex;
  let hasExplicitSeparator = false;

  while (index < lines.length) {
    const parsed = splitTableRow(lines[index] ?? "");
    if (!parsed) break;
    rows.push(parsed.cells);
    hasExplicitSeparator ||= parsed.separator !== "single-space-grid";
    index += 1;
  }

  if (rows.length < 2) return null;
  const maxColumns = Math.max(...rows.map((row) => row.length));
  if (maxColumns < 2 || maxColumns > 8) return null;
  if (!hasExplicitSeparator && !rows.every((row) => row.every(isShortMathGridCell))) return null;

  return {
    rows: rows.map((row) => [...row, ...Array.from({ length: maxColumns - row.length }, () => "")]),
    endIndex: index,
  };
}

function splitTableRow(line: string): { cells: string[]; separator: "tab" | "wide-space" | "single-space-grid" } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (line.includes("\t")) {
    return {
      cells: line.split(/\t/).map((cell) => cell.trim()),
      separator: "tab",
    };
  }

  if (/\s{2,}/.test(line)) {
    return {
      cells: line.split(/\s{2,}/).map((cell) => cell.trim()).filter((cell) => cell.length > 0),
      separator: "wide-space",
    };
  }

  const tokens = trimmed.split(/\s+/);
  if (tokens.length >= 2 && tokens.length <= 8 && tokens.every(isShortMathGridCell)) {
    return { cells: tokens, separator: "single-space-grid" };
  }

  return null;
}

function renderPromptTable(rows: string[][]) {
  return [
    '<div class="ev-prompt-table-wrap">',
    '<table class="ev-prompt-table"><tbody>',
    rows
      .map(
        (row) =>
          `<tr>${row
            .map((cell) => `<td>${formatPromptTableCell(cell)}</td>`)
            .join("")}</tr>`,
      )
      .join(""),
    "</tbody></table>",
    "</div>",
  ].join("");
}

function formatPromptTableCell(cell: string) {
  const trimmed = cell.trim();
  if (!trimmed) return "";
  if (looksLikeTableMathCell(trimmed) && !hasMathDelimiters(trimmed)) return `$${escapeHtml(normalizeBareMathSource(trimmed))}$`;
  return formatPromptSegment(trimmed);
}

function formatPromptLine(line: string) {
  if (!line.trim()) return '<div class="ev-prompt-gap" aria-hidden="true"></div>';

  const cells = splitSpreadCells(line);
  if (cells.length > 1) {
    return `<div class="ev-latex-spread">${cells.map((cell) => `<span class="ev-latex-cell">${formatPromptSegment(cell)}</span>`).join("")}</div>`;
  }

  return `<p>${formatPromptSegment(line)}</p>`;
}

function splitSpreadCells(line: string) {
  if (line.includes("\t")) return line.split(/\t+/).map((cell) => cell.trim()).filter(Boolean);
  const wideSpaceCells = line.split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
  if (wideSpaceCells.length > 1) return wideSpaceCells;
  return [line.trim()];
}

function formatPromptSegment(segment: string) {
  const trimmed = segment.trim();
  const simpleFraction = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (simpleFraction) return `$\\frac{${simpleFraction[1]}}{${simpleFraction[2]}}$`;

  const escaped = escapeHtml(segment);
  if (hasMathDelimiters(segment)) return escaped;
  if (looksLikeBareMath(segment)) return `$${escapeHtml(normalizeBareMathSource(segment))}$`;

  return wrapBareMathRuns(segment);
}

const BARE_LATEX_COMMAND_PATTERN = /\\(?:frac|dfrac|tfrac|sqrt|sum|prod|int|lim|sin|cos|tan|log|ln|min|max|alpha|beta|gamma|delta|theta|lambda|mu|pi|cdot|times|dots|ldots|leq|geq|neq|infty|angle|triangle|mathbb|text|lfloor|rfloor|omega|Gamma)\b/g;
const OCR_PRODUCT_PATTERN = /((?:\d\s*){1,4}(?:\\times|\\cdot|×|·|\*)\s*(?:(?:\d\s*){1,4}|\\dots|\\ldots|[a-zA-Z])(?:\s*(?:\\times|\\cdot|×|·|\*)\s*(?:(?:\d\s*){1,4}|\\dots|\\ldots|[a-zA-Z]))*[?!.]?)/g;

function wrapBareMathRuns(segment: string) {
  const withProductRuns = wrapOcrProductRuns(segment);
  if (withProductRuns.wrapped) return withProductRuns.html;
  return wrapBareLatexRuns(segment);
}

function wrapOcrProductRuns(segment: string) {
  let output = "";
  let index = 0;
  let wrapped = false;

  OCR_PRODUCT_PATTERN.lastIndex = 0;
  while (true) {
    const match = OCR_PRODUCT_PATTERN.exec(segment);
    if (!match) break;
    const start = match.index;
    const rawRun = match[0];
    if (start < index || !rawRun.includes("\\")) continue;

    output += escapeHtml(segment.slice(index, start));
    output += `$${escapeHtml(normalizeBareMathSource(rawRun))}$`;
    index = start + rawRun.length;
    wrapped = true;
  }

  return { html: output + escapeHtml(segment.slice(index)), wrapped };
}

function wrapBareLatexRuns(segment: string) {
  let output = "";
  let index = 0;
  BARE_LATEX_COMMAND_PATTERN.lastIndex = 0;

  while (true) {
    const match = BARE_LATEX_COMMAND_PATTERN.exec(segment);
    if (!match) break;
    const start = match.index;
    if (start < index) continue;

    output += escapeHtml(segment.slice(index, start));
    const end = consumeMathRun(segment, start);
    if (end <= start) {
      output += escapeHtml(match[0]);
      index = start + match[0].length;
    } else {
      output += `$${escapeHtml(normalizeBareMathSource(segment.slice(start, end)))}$`;
      index = end;
    }
    BARE_LATEX_COMMAND_PATTERN.lastIndex = index;
  }

  return output + escapeHtml(segment.slice(index));
}

function consumeMathRun(value: string, start: number) {
  let index = consumeMathAtom(value, start);
  if (index === start) return start;

  while (index < value.length) {
    const afterSpaces = consumeSpaces(value, index);
    const operatorEnd = consumeMathOperator(value, afterSpaces);
    if (operatorEnd === afterSpaces) break;

    const atomStart = consumeSpaces(value, operatorEnd);
    const atomEnd = consumeMathAtom(value, atomStart);
    if (atomEnd === atomStart) break;
    index = atomEnd;
  }

  return trimRunEnd(value, index);
}

function consumeMathAtom(value: string, start: number) {
  let index = consumeSpaces(value, start);
  if (index >= value.length) return start;

  if (value[index] === "\\") return consumeScripts(value, consumeLatexCommand(value, index));
  if (value[index] === "{") return consumeScripts(value, consumeBalanced(value, index, "{", "}"));
  if (value[index] === "(") return consumeScripts(value, consumeBalanced(value, index, "(", ")"));

  if (/[0-9.]/.test(value[index])) {
    while (index < value.length && /[0-9.]/.test(value[index])) index += 1;
    return consumeScripts(value, index);
  }

  if (/[a-zA-Z]/.test(value[index]) && !/[a-zA-Z]/.test(value[index + 1] ?? "")) {
    return consumeScripts(value, index + 1);
  }

  return start;
}

function consumeLatexCommand(value: string, start: number) {
  let index = start + 1;
  while (index < value.length && /[a-zA-Z]/.test(value[index])) index += 1;

  index = consumeSpaces(value, index);
  if (value[index] === "[") index = consumeBalanced(value, index, "[", "]");

  while (index < value.length) {
    const beforeGroup = consumeSpaces(value, index);
    if (value[beforeGroup] !== "{") break;
    index = consumeBalanced(value, beforeGroup, "{", "}");
  }

  return consumeScripts(value, index);
}

function consumeScripts(value: string, start: number) {
  let index = start;
  while (index < value.length) {
    const scriptStart = consumeSpaces(value, index);
    if (value[scriptStart] !== "^" && value[scriptStart] !== "_") break;
    const atomStart = consumeSpaces(value, scriptStart + 1);
    if (value[atomStart] === "{" || value[atomStart] === "[" || value[atomStart] === "(") {
      const close = value[atomStart] === "{" ? "}" : value[atomStart] === "[" ? "]" : ")";
      index = consumeBalanced(value, atomStart, value[atomStart], close);
    } else if (value[atomStart] === "\\") {
      index = consumeLatexCommand(value, atomStart);
    } else if (/[a-zA-Z0-9]/.test(value[atomStart] ?? "")) {
      index = atomStart + 1;
    } else {
      break;
    }
  }
  return index;
}

function consumeBalanced(value: string, start: number, open: string, close: string) {
  let depth = 0;
  for (let index = start; index < value.length; index += 1) {
    if (value[index] === "\\" && index + 1 < value.length) {
      index += 1;
      continue;
    }
    if (value[index] === open) depth += 1;
    if (value[index] === close) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return start;
}

function consumeMathOperator(value: string, start: number) {
  if (/^[+\-*/=<>≤≥×÷·]$/.test(value[start] ?? "")) return start + 1;
  if (value.startsWith("\\cdot", start)) return start + "\\cdot".length;
  if (value.startsWith("\\times", start)) return start + "\\times".length;
  if (value.startsWith("\\leq", start) || value.startsWith("\\geq", start) || value.startsWith("\\neq", start)) {
    return start + 4;
  }
  return start;
}

function consumeSpaces(value: string, start: number) {
  let index = start;
  while (index < value.length && /\s/.test(value[index])) index += 1;
  return index;
}

function trimRunEnd(value: string, end: number) {
  let index = end;
  while (index > 0 && /\s/.test(value[index - 1])) index -= 1;
  return index;
}

function hasMathDelimiters(value: string) {
  return /\$[^$]+\$|\\\(|\\\[/.test(value);
}

function looksLikeBareMath(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("\\") && hasBareLatexCommand(trimmed)) return true;
  if (!trimmed) return false;

  const withoutLatexCommands = trimmed
    .replace(/\\[a-zA-Z]+\s*(?=\{|\[|\s|$)/g, " ")
    .replace(/\\text\s*\{[^}]*\}/g, " ");
  const hasNaturalWords = /[a-zA-Z]{4,}/.test(withoutLatexCommands);
  const mathSignalCount = [
    /\\[a-zA-Z]+/.test(trimmed),
    /[=^_<>≤≥]/.test(trimmed),
    /(?:\\times|\\cdot|×|·|\*)/.test(trimmed),
    /\d\s+\d/.test(trimmed),
    /[+\-*/]/.test(trimmed) && /\d|[a-zA-Z]/.test(trimmed),
  ].filter(Boolean).length;

  if (hasNaturalWords && !/\\text\s*\{/.test(trimmed)) return false;
  return mathSignalCount > 0;
}

function hasBareLatexCommand(value: string) {
  return /\\(?:frac|dfrac|tfrac|sqrt|sum|prod|int|lim|sin|cos|tan|log|ln|min|max|alpha|beta|gamma|delta|theta|lambda|mu|pi|cdot|times|dots|ldots|leq|geq|neq|infty|angle|triangle|mathbb|text|lfloor|rfloor|omega|Gamma)/.test(value);
}

function normalizeBareMathSource(value: string) {
  let normalized = value.trim();

  let previous = "";
  while (previous !== normalized) {
    previous = normalized;
    normalized = normalized.replace(/\b(\d)\s+(\d)\b/g, "$1$2");
  }

  normalized = normalized
    .replace(/\\text\s*\{([^}]*)\}/g, (_match, text: string) => `\\text{${text.replace(/\s+/g, " ")}}`)
    .replace(/\s*([_^])\s*\{\s*([^{}]*?)\s*\}/g, (_match, script: string, body: string) => `${script}{${body.trim()}}`)
    .replace(/\s*([_^])\s*([a-zA-Z0-9])/g, "$1$2")
    .replace(/\s+([,.;:?!])/g, "$1")
    .replace(/\s{2,}/g, " ");

  return normalized;
}

function looksLikeTableMathCell(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^[a-zA-Z]$/.test(trimmed)) return true;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return true;
  if (/^-?\d+(?:\.\d+)?\s*\/\s*-?\d+(?:\.\d+)?$/.test(trimmed)) return true;
  return looksLikeBareMath(trimmed);
}

function isShortMathGridCell(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 12) return false;
  if (!/^[a-zA-Z0-9()[\]{}^_+\-*/\\.=]+$/.test(trimmed)) return false;
  if (/[a-zA-Z]{3,}/.test(trimmed)) return false;
  return true;
}

function unescapeMath(str: string) {
  return str.replace(/\\\\(?=[a-zA-Z{])/g, "\\");
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function unescapeHtml(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}
