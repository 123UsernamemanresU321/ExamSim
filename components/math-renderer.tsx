"use client";

import { useEffect, useRef } from "react";
import renderMathInElement from "katex/dist/contrib/auto-render";

export function MathRenderer({ latex, html, className }: { latex?: string; html?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  
  // Unescape double backslashes that were likely caused by double-stringification
  // but avoid breaking actual LaTeX newlines (which are also \\).
  // In our context, most double-escaped commands like \\mathbb should be \mathbb.
  const unescape = (str: string) => {
    if (!str) return "";
    // If we see \\ followed by a command-like character, it's likely double-escaped.
    // However, to be safe and handle the current broken state, we'll replace \\ with \ 
    // when it precedes a character that isn't a newline or space.
    return str.replace(/\\\\(?=[a-zA-Z{])/g, "\\");
  };

  const content = html ? unescape(html) : (latex ? unescape(latex) : "");

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
