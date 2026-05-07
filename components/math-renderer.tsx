"use client";

import { useEffect, useRef } from "react";
import renderMathInElement from "katex/dist/contrib/auto-render";

export function MathRenderer({ latex, html, className }: { latex?: string; html?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  
  // Prevent the browser from misinterpreting mathematical inequalities as HTML tags.
  // We escape < only if it is NOT followed by a known safe HTML tag.
  const sanitize = (str: string) => {
    if (!str) return "";
    return str
      .replace(/<(?!(?:\/?(?:p|strong|em|br|ol|ul|li|div|span))(?:\s|>))/gi, "&lt;")
      .replace(/(?<!(?:p|strong|em|br|ol|ul|li|div|span|"))>/gi, "&gt;");
  };

  const content = html ? sanitize(html) : (latex ? sanitize(latex) : "");

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
