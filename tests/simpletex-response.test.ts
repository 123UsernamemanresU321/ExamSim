import { describe, expect, it } from "vitest";
import { normalizeSimpleTexResponse } from "../supabase/functions/_shared/simpletex-response";

describe("SimpleTeX response normalization", () => {
  it("normalizes documented document and formula result fields", () => {
    expect(normalizeSimpleTexResponse({ content: "# Document" })).toEqual({ text: "# Document", latex: null });
    expect(normalizeSimpleTexResponse({ latex: "x^2" })).toEqual({ text: null, latex: "x^2" });
  });

  it("extracts bounded text and LaTeX from general OCR info blocks", () => {
    expect(normalizeSimpleTexResponse({
      type: "document",
      info: [
        { text: "The first point of every line" },
        { markdown: "Any line from the origin" },
        { latex: "(ka,kb)" },
      ],
    })).toEqual({
      text: "The first point of every line\n\nAny line from the origin",
      latex: "(ka,kb)",
    });
  });

  it("does not treat arbitrary provider metadata as recognized text", () => {
    expect(normalizeSimpleTexResponse({ info: { width: 1200, score: 0.8, type: "document" } })).toEqual({ text: null, latex: null });
  });
});
