import { describe, expect, it } from "vitest";
import { formatPromptContent, renderMathMarkup } from "@/components/math-renderer";

describe("prompt rendering", () => {
  it("preserves tab-separated fraction choices as evenly spread math cells", () => {
    const html = formatPromptContent({
      latex: [
        "What is the numerator of the largest fraction below?",
        "",
        "500/1000\t501/1001\t502/1002\t503/1003\t504/1004",
      ].join("\n"),
    });

    expect(html).toContain("ev-latex-spread");
    expect(html).toContain("$\\frac{500}{1000}$");
    expect(html).toContain("$\\frac{504}{1004}$");
  });

  it("keeps prose outside display math while still rendering inline math delimiters", () => {
    const html = formatPromptContent({ latex: "Find $x$ if x^2 = 4." });

    expect(html).toContain("Find $x$ if x^2 = 4.");
    expect(html).not.toContain("$$Find");
  });

  it("repairs tab-separated fraction choices inside html paragraphs", () => {
    const html = formatPromptContent({
      html: "<p>What is largest?</p><p>500/1000\t501/1001\t502/1002</p>",
    });

    expect(html).toContain("ev-latex-spread");
    expect(html).toContain("$\\frac{501}{1001}$");
  });

  it("wraps bare latex commands inside html paragraphs for KaTeX auto-render", () => {
    const html = formatPromptContent({ html: "<p>Simplify \\frac{1}{2}+\\frac{1}{3}.</p>" });

    expect(html).toContain("$\\frac{1}{2}$");
    expect(html).toContain("$\\frac{1}{3}$");
  });

  it("renders KaTeX markup before React writes prompt HTML to the DOM", () => {
    const html = renderMathMarkup(formatPromptContent({ latex: "Find $x$ and compare 500/1000\t501/1001." }));

    expect(html).toContain("katex");
    expect(html).not.toContain("$x$");
    expect(html).not.toContain("$\\frac{500}{1000}$");
  });
});
