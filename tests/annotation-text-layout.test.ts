import { describe, expect, it } from "vitest";
import { layoutAnnotationTextBox, wrapAnnotationText } from "@/lib/annotation-text-layout";

const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;

describe("annotation text layout", () => {
  it("expands text boxes so multiline notes fit inside generated PDFs", () => {
    const layout = layoutAnnotationTextBox({
      text: "Why?\nHow?",
      boxWidth: 120,
      boxHeight: 24,
      fontSize: 18,
      measureText: measure,
    });

    expect(layout.lines).toEqual(["Why?", "How?"]);
    expect(layout.height).toBeGreaterThan(24);
    expect(layout.height).toBeGreaterThanOrEqual(layout.paddingY * 2 + layout.lineHeight * 2);
  });

  it("wraps long annotation text to the available width", () => {
    const lines = wrapAnnotationText("This explanation needs more detail", 78, 12, measure);

    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measure(line, 12)).toBeLessThanOrEqual(78);
    }
  });
});
