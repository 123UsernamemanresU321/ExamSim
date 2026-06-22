import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyProviderFailure, evaluateExtractedPaperText, evaluatePaperPackage } from "../scripts/lib/smart-import-qa.mjs";

describe("IB Mathematics AA HL Paper 2 live QA evaluator", () => {
  it("runs provider QA through authenticated Edge boundaries and records reviewed evidence", () => {
    expect(existsSync("scripts/run-live-smart-import-qa.mjs")).toBe(true);
    const script = readFileSync("scripts/run-live-smart-import-qa.mjs", "utf8");
    expect(script).toContain('invokeEdge("ingest-assessment"');
    expect(script).toContain('invokeEdge("mineru-submit-hosted-job"');
    expect(script).toContain('invokeEdge("mineru-poll-hosted-job"');
    expect(script).toContain('invokeEdge("ai-parse-assessment"');
    expect(script).toContain('invokeEdge("simpletex-ocr-source-page"');
    expect(script).toContain('mode: "general"');
    expect(script).toContain('.from("smart_import_qa_results")');
    expect(script).toContain("Reusing completed synthetic QA import");
    expect(script).toContain("hasExistingText");
    expect(script).toContain("fileHashIfPresent");
    expect(script).not.toContain("SUPABASE_SERVICE_ROLE_KEY=");
  });

  it("validates question count and marks from MinerU text when DeepSeek is unavailable", () => {
    const marks = [7, 4, 5, 8, 5, 8, 6, 6, 7, 15, 18, 21];
    const text = [
      "Section A",
      ...marks.slice(0, 9).map((mark, index) => `## ${index + 1}. [Maximum mark: ${mark}] ${index === 0 ? "(c) Sketch the graph" : index === 3 ? "roof diagram" : index === 6 ? "seating diagram" : "prompt"}`),
      "Section B",
      ...marks.slice(9).map((mark, index) => `## ${index + 10}. [Maximum mark: ${mark}] ${index === 0 ? "population table" : index === 2 ? "(f) Sketch curve asymptote" : "prompt"}`),
    ].join("\n");

    const result = evaluateExtractedPaperText(text, {
      expectedQuestionCount: 12,
      expectedTotalMarks: 110,
      sectionAEnd: 9,
      sectionBStart: 10,
      requiredPrompts: {
        "1(c)": ["sketch", "graph"],
        "4": ["roof", "diagram"],
        "7": ["seat", "diagram"],
        "10": ["population", "table"],
        "12(f)": ["sketch", "asymptote"],
      },
    });

    expect(result.passed).toBe(true);
    expect(result.actualQuestionCount).toBe(12);
    expect(result.actualTotalMarks).toBe(110);
  });

  it("classifies a funded-provider blocker without treating it as parser success", () => {
    expect(classifyProviderFailure(new Error("DeepSeek parse failed: 402 Insufficient Balance"))).toBe("insufficient_balance");
    expect(classifyProviderFailure(new Error("DeepSeek parse failed: 503 unavailable"))).toBe("provider_unavailable");
  });

  it("accepts the expected 12-question, 110-mark section structure", () => {
    const marks = [7, 4, 5, 8, 5, 8, 6, 6, 7, 15, 18, 21];
    const questions: Array<{
      node_key: string;
      marks: number;
      prompt: { html: string };
      children: Array<{ node_key: string; marks: number; prompt: { html: string } }>;
    }> = marks.map((mark, index) => ({
      node_key: String(index + 1),
      marks: mark,
      prompt: { html: index === 9 ? "Population data table" : `Question ${index + 1}` },
      children: [],
    }));
    questions[0].children = [{ node_key: "1(c)", marks: 3, prompt: { html: "Sketch the graph on the grid" } }];
    questions[3].prompt.html = "Roof cross-section diagram";
    questions[6].prompt.html = "Seating-row diagram";
    questions[11].children = [{ node_key: "12(f)", marks: 4, prompt: { html: "Sketch the curve with both asymptotes" } }];

    const result = evaluatePaperPackage({ questions }, {
      expectedQuestionCount: 12,
      expectedTotalMarks: 110,
      sectionAEnd: 9,
      sectionBStart: 10,
      requiredPrompts: {
        "1(c)": ["sketch", "graph"],
        "4": ["roof", "diagram"],
        "7": ["seating", "diagram"],
        "10": ["population", "table"],
        "12(f)": ["sketch", "asymptote"],
      },
    });

    expect(result.passed).toBe(true);
    expect(result.actualQuestionCount).toBe(12);
    expect(result.actualTotalMarks).toBe(110);
    expect(result.missingQuestionNumbers).toEqual([]);
    expect(result.missingRequiredPrompts).toEqual([]);
  });

  it("fails when a provider silently drops a question or visual prompt", () => {
    const result = evaluatePaperPackage({
      questions: Array.from({ length: 11 }, (_, index) => ({ node_key: String(index + 1), marks: 10, prompt: { html: "text" } })),
    }, {
      expectedQuestionCount: 12,
      expectedTotalMarks: 110,
      sectionAEnd: 9,
      sectionBStart: 10,
      requiredPrompts: { "12(f)": ["sketch", "asymptote"] },
    });

    expect(result.passed).toBe(false);
    expect(result.missingQuestionNumbers).toContain(12);
    expect(result.missingRequiredPrompts).toContain("12(f)");
  });
});
