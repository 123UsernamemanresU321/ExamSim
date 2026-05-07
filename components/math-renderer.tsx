"use client";

import { useEffect, useRef } from "react";
import renderMathInElement from "katex/dist/contrib/auto-render";

export function MathRenderer({ latex, html, className }: { latex?: string; html?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  
  // If we only have latex, we must escape it because the browser will 
  // misinterpret < and > as HTML tags before KaTeX can process them.
  const escapedLatex = latex ? latex.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
  const content = html || (latex ? `<span>${escapedLatex}</span>` : "");

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
