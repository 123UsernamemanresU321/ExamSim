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

    expect(html).toContain("$\\frac{1}{2}+\\frac{1}{3}$");
  });

  it("renders KaTeX markup before React writes prompt HTML to the DOM", () => {
    const html = renderMathMarkup(formatPromptContent({ latex: "Find $x$ and compare 500/1000\t501/1001." }));

    expect(html).toContain("katex");
    expect(html).not.toContain("$x$");
    expect(html).not.toContain("$\\frac{500}{1000}$");
  });

  it("repairs OCR-spaced bare product expressions before KaTeX rendering", () => {
    const formatted = formatPromptContent({
      latex: "What is the value of 1 9 \\times 1 8 \\times 1 7 \\times \\dots \\times 3 \\times 2 \\times 1?",
    });
    const rendered = renderMathMarkup(formatted);

    expect(formatted).toContain("$19 \\times 18 \\times 17 \\times \\dots \\times 3 \\times 2 \\times 1?$");
    expect(rendered).toContain("katex");
    expect(rendered).not.toContain("1 9");
    expect(rendered).not.toContain("$19 \\times");
  });

  it("repairs OCR-spaced bare equation paragraphs before KaTeX rendering", () => {
    const formatted = formatPromptContent({
      latex: [
        "x ^ {3} + 3 x y ^ {2} = 2 8, \\text { and }",
        "y ^ {3} + 3 y x ^ {2} = 2 6.",
      ].join("\n"),
    });
    const rendered = renderMathMarkup(formatted);

    expect(formatted).toContain("$x^{3} + 3 x y^{2} = 28, \\text{ and }$");
    expect(formatted).toContain("$y^{3} + 3 y x^{2} = 26.$");
    expect(rendered.match(/class="katex"/g)).toHaveLength(2);
  });

  it("converts OCR table blocks into semantic prompt tables with math cells", () => {
    const formatted = formatPromptContent({
      latex: [
        "Use the table below.",
        "",
        "x\ty\t9",
        "z\tw\t80",
        "45\t16\t",
      ].join("\n"),
    });
    const rendered = renderMathMarkup(formatted);

    expect(formatted).toContain("<table");
    expect(formatted).toContain("<td>$x$</td>");
    expect(formatted).toContain("<td></td>");
    expect(rendered).toContain("<table");
    expect(rendered).toContain("katex");
  });

  it("converts short single-space math grids into prompt tables without changing prose", () => {
    const formatted = formatPromptContent({
      latex: [
        "Use the table below.",
        "",
        "x y 9",
        "z w 80",
        "45 16",
        "",
        "Find the missing value.",
      ].join("\n"),
    });

    expect(formatted).toContain("<table");
    expect(formatted).toContain("<td>$w$</td>");
    expect(formatted).toContain("<td></td>");
    expect(formatted).toContain("<p>Find the missing value.</p>");
  });

  it("renders delimiter-free math divs as display math", () => {
    const rendered = renderMathMarkup(formatPromptContent({ html: '<div class="math">x^2 + y^2 = z^2</div>' }));

    expect(rendered).toContain("katex-display");
    expect(rendered).not.toContain('<div class="math">x^2 + y^2 = z^2</div>');
  });

  it("keeps nested root expressions as one KaTeX formula", () => {
    const expression = "\\sqrt[4]{25 + \\sqrt[4]{14 + \\sqrt{2 + \\sqrt[3]{8}}}}^4";
    const formatted = formatPromptContent({ html: `<p>${expression}</p>` });
    const rendered = renderMathMarkup(formatted);

    expect(formatted).toContain(`$${expression}$`);
    expect(rendered.match(/class="katex"/g)).toHaveLength(1);
  });

  it("keeps nested root expressions embedded in prose as one KaTeX formula", () => {
    const expression = "\\sqrt[4]{25 + \\sqrt[4]{14 + \\sqrt{2 + \\sqrt[3]{8}}}}^4";
    const formatted = formatPromptContent({ html: `<p>Evaluate ${expression}.</p>` });
    const rendered = renderMathMarkup(formatted);

    expect(formatted).toContain(`Evaluate $${expression}$`);
    expect(rendered.match(/class="katex"/g)).toHaveLength(1);
  });

  it("renders custom olympiad floor notation without KaTeX error styling", () => {
    const rendered = renderMathMarkup(formatPromptContent({ latex: "Prove that \\floor{\\lambda} is a perfect square." }));

    expect(rendered).toContain("katex");
    expect(rendered).toContain("⌊");
    expect(rendered).not.toContain("katex-error");
    expect(rendered).not.toContain("merror");
  });

  it("repairs OCR-style floor notation without braces before KaTeX rendering", () => {
    const formatted = formatPromptContent({ latex: "\\floor\\lambda^{n+1}, \\floor\\lambda^{n+2}, \\ldots, \\floor\\lambda^{4n}" });
    const rendered = renderMathMarkup(formatted);

    expect(formatted).toContain("\\floor{\\lambda^{n+1}}");
    expect(formatted).toContain("\\floor{\\lambda^{4n}}");
    expect(rendered).toContain("katex");
    expect(rendered).not.toContain("katex-error");
    expect(rendered).not.toContain("merror");
  });

  it("repairs OCR line breaks between floor commands and their arguments", () => {
    const formatted = formatPromptContent({
      latex: ["\\floor", "λ", "n", "+", "1", ",", "\\floor", "λ", "n", "+", "2"].join("\n"),
    });
    const rendered = renderMathMarkup(formatted);

    expect(formatted).toContain("\\floor{λ}");
    expect(rendered).toContain("katex");
    expect(rendered).not.toContain("katex-error");
    expect(rendered).not.toContain("merror");
  });

  it("renders bare subscript variables inside prose as clear KaTeX math", () => {
    const formatted = formatPromptContent({ latex: "Find a_0 and a_1 before comparing them with a0." });
    const rendered = renderMathMarkup(formatted);

    expect(formatted).toContain("Find $a_0$ and $a_1$ before comparing them with a0.");
    expect(rendered.match(/class="katex"/g)).toHaveLength(2);
    expect(rendered).toContain("msub");
    expect(rendered).not.toContain("$a_0$");
  });
});
