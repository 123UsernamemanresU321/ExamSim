import { describe, expect, it } from "vitest";
import { sanitizeExamHtml } from "@/lib/examsim/sanitize-exam-html";

describe("exam HTML sanitization", () => {
  it("removes scriptable markup and unsafe URL schemes", () => {
    const result = sanitizeExamHtml('<p onclick="alert(1)">Prompt</p><img src=x onerror=alert(1)><a href="javascript:alert(1)">open</a><svg onload=alert(1) />');
    expect(result).toContain("<p>Prompt</p>");
    expect(result).not.toMatch(/onclick|onerror|onload|javascript:|<img|<svg/i);
  });

  it("preserves restrained exam formatting and table structure", () => {
    const result = sanitizeExamHtml('<p><strong>Q1</strong></p><table><tbody><tr><th scope="col">x</th><td colspan="2">4</td></tr></tbody></table>');
    expect(result).toContain("<strong>Q1</strong>");
    expect(result).toContain('<th scope="col">x</th>');
    expect(result).toContain('<td colspan="2">4</td>');
  });
});
