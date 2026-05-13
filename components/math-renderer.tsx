"use client";

import katex from "katex";

export function formatPromptContent({ latex, html }: { latex?: string; html?: string }) {
  if (html) return formatHtmlPromptContent(unescapeMath(html));
  if (!latex) return "";

  const normalized = unescapeMath(latex).replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";

  return normalized
    .split("\n")
    .map((line) => formatPromptLine(line))
    .join("");
}

function formatHtmlPromptContent(html: string) {
  if (!html.trim()) return "";
  if (!html.includes("\t") && !hasBareLatexCommand(html)) return html;

  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return html
      .split(/\r?\n/)
      .map((line) => formatPromptLine(line))
      .join("");
  }

  return html.replace(/<p([^>]*)>([\s\S]*?)<\/p>/gi, (_match, attrs: string, body: string) => {
    const text = body.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").trim();
    if (text.includes("\t")) return formatPromptLine(text);
    if (hasBareLatexCommand(text)) return `<p${attrs}>${formatPromptSegment(text)}</p>`;
    return `<p${attrs}>${body}</p>`;
  });
}

export function MathRenderer({ latex, html, className }: { latex?: string; html?: string; className?: string }) {
  const content = renderMathMarkup(formatPromptContent({ latex, html }));

  if (!content) return null;

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}

export function renderMathMarkup(content: string) {
  if (!content) return "";

  let rendered = "";
  let index = 0;

  while (index < content.length) {
    const next = findNextMathDelimiter(content, index);
    if (!next) {
      rendered += content.slice(index);
      break;
    }

    rendered += content.slice(index, next.start);
    const close = findClosingDelimiter(content, next.contentStart, next.close);
    if (close === -1) {
      rendered += content.slice(next.start);
      break;
    }

    const source = content.slice(next.contentStart, close);
    rendered += renderKatex(source, next.display, content.slice(next.start, close + next.close.length));
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
  if (looksLikeBareMath(segment)) return `$${escaped}$`;

  return escaped.replace(
    /\\(?:frac|dfrac|tfrac|sqrt|sum|prod|int|lim|sin|cos|tan|log|ln|alpha|beta|gamma|delta|theta|lambda|mu|pi|cdot|times|leq|geq|neq|infty|angle|triangle)(?:\s*\{[^{}]*\}){0,3}/g,
    (match) => `$${match}$`,
  );
}

function hasMathDelimiters(value: string) {
  return /\$[^$]+\$|\\\(|\\\[/.test(value);
}

function looksLikeBareMath(value: string) {
  const trimmed = value.trim();
  if (!trimmed || (/\s/.test(trimmed) && /[a-zA-Z]{4,}/.test(trimmed))) return false;
  return /\\[a-zA-Z]+|[=^_]|[<>≤≥]/.test(trimmed);
}

function hasBareLatexCommand(value: string) {
  return /\\(?:frac|dfrac|tfrac|sqrt|sum|prod|int|lim|sin|cos|tan|log|ln|alpha|beta|gamma|delta|theta|lambda|mu|pi|cdot|times|leq|geq|neq|infty|angle|triangle)/.test(value);
}

function unescapeMath(str: string) {
  return str.replace(/\\\\(?=[a-zA-Z{])/g, "\\");
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
