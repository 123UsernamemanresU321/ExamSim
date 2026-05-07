"use client";

import { useEffect, useRef } from "react";
import renderMathInElement from "katex/dist/contrib/auto-render";

export function MathRenderer({ latex, html, className }: { latex?: string; html?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  
  // Prevent the browser from misinterpreting mathematical inequalities as HTML tags.
  // We escape < and > only when they are NOT part of a valid HTML tag structure.
  const sanitize = (str: string) => 
    str
      .replace(/<(?![a-zA-Z/])/g, "&lt;")
      .replace(/>(?![a-zA-Z/])/g, "&gt;");

  const content = html ? sanitize(html) : (latex ? `<span>${sanitize(latex)}</span>` : "");

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
    <span
      ref={ref}
      className={className}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
