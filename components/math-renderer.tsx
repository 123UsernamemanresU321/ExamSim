"use client";

import { useEffect, useRef } from "react";
import renderMathInElement from "katex/dist/contrib/auto-render";

export function MathRenderer({ latex, html, className }: { latex?: string; html?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const content = html || (latex ? `<span>${latex}</span>` : "");

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
