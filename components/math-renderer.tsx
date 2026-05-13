"use client";

import { useEffect, useRef } from "react";
import renderMathInElement from "katex/dist/contrib/auto-render";

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
  const ref = useRef<HTMLDivElement>(null);
  const content = formatPromptContent({ latex, html });

  useEffect(() => {
    if (ref.current) {
      renderMathInElement(ref.current, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false },
          { left: "\\[", right: "\\]", display: true },
        ],
        throwOnError: false,
      });
    }
  }, [content]);

  if (!content) return null;

  return (
    <div
      ref={ref}
      className={className}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
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
