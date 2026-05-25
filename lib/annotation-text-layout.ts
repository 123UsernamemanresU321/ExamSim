export type AnnotationTextLayout = {
  lines: string[];
  lineHeight: number;
  paddingX: number;
  paddingY: number;
  height: number;
};

export type TextMeasure = (text: string, fontSize: number) => number;

export function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.56;
}

export function layoutAnnotationTextBox({
  text,
  boxWidth,
  boxHeight,
  fontSize,
  paddingX = 6,
  paddingY = 5,
  measureText = estimateTextWidth,
}: {
  text: string;
  boxWidth: number;
  boxHeight: number;
  fontSize: number;
  paddingX?: number;
  paddingY?: number;
  measureText?: TextMeasure;
}): AnnotationTextLayout {
  const safeFontSize = Number.isFinite(fontSize) ? Math.max(7, fontSize) : 12;
  const safeBoxWidth = Number.isFinite(boxWidth) ? Math.max(8, boxWidth) : 120;
  const safeBoxHeight = Number.isFinite(boxHeight) ? Math.max(8, boxHeight) : 32;
  const safePaddingX = Math.max(0, paddingX);
  const safePaddingY = Math.max(0, paddingY);
  const lineHeight = Math.max(safeFontSize + 2, safeFontSize * 1.2);
  const maxLineWidth = Math.max(1, safeBoxWidth - safePaddingX * 2);
  const lines = wrapAnnotationText(text, maxLineWidth, safeFontSize, measureText);
  const contentHeight = lines.length ? lines.length * lineHeight : lineHeight;
  return {
    lines,
    lineHeight,
    paddingX: safePaddingX,
    paddingY: safePaddingY,
    height: Math.max(safeBoxHeight, safePaddingY * 2 + contentHeight),
  };
}

export function wrapAnnotationText(
  text: string,
  maxWidth: number,
  fontSize: number,
  measureText: TextMeasure = estimateTextWidth,
): string[] {
  const normalized = text.replace(/\r\n?/g, "\n").slice(0, 240);
  const explicitLines = normalized.split("\n");
  const wrapped: string[] = [];
  for (const explicitLine of explicitLines) {
    wrapped.push(...wrapSingleLine(explicitLine, maxWidth, fontSize, measureText));
  }
  return wrapped.length ? wrapped : [""];
}

function wrapSingleLine(line: string, maxWidth: number, fontSize: number, measureText: TextMeasure): string[] {
  if (!line.trim()) return [""];
  const words = line.split(/(\s+)/).filter((part) => part.length > 0);
  const result: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current}${word}` : word.trimStart();
    if (!current || measureText(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }
    result.push(current.trimEnd());
    current = word.trimStart();
    if (measureText(current, fontSize) > maxWidth) {
      const broken = breakLongWord(current, maxWidth, fontSize, measureText);
      result.push(...broken.slice(0, -1));
      current = broken.at(-1) ?? "";
    }
  }

  if (current) result.push(current.trimEnd());
  return result.length ? result : [line];
}

function breakLongWord(word: string, maxWidth: number, fontSize: number, measureText: TextMeasure): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const char of word) {
    const candidate = `${current}${char}`;
    if (!current || measureText(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }
    chunks.push(current);
    current = char;
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [word];
}
