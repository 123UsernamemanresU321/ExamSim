"use client";

import katex from "katex";

export function MathRenderer({ latex }: { latex: string }) {
  const html = katex.renderToString(latex, {
    throwOnError: false,
    trust: false,
    output: "htmlAndMathml",
  });
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
