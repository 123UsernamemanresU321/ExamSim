import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("question bank source preview", () => {
  it("renders original visual context through PDF.js instead of an embedded PDF plugin iframe", () => {
    const source = read("components/owner/question-bank-source-preview.tsx");

    expect(source).toContain("pdfjs-dist/legacy/build/pdf.mjs");
    expect(source).toContain("pdfjs.getDocument");
    expect(source).toContain("toDataURL");
    expect(source).not.toContain("<iframe");
  });

  it("uses the selected question page range when rendering source pages", () => {
    const source = read("components/owner/question-bank-source-preview.tsx");

    expect(source).toContain("pageStart");
    expect(source).toContain("pageEnd");
    expect(source).toContain("pagesToRender");
  });
});
