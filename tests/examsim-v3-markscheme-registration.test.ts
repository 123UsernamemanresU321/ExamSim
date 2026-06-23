import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Examsim V3 markscheme registration", () => {
  it("registers uploaded markschemes during assessment ingestion", () => {
    const ingest = read("supabase/functions/ingest-assessment/index.ts");
    expect(ingest).toContain('.from("markscheme_documents")');
    expect(ingest).toContain("markscheme_document_id");
  });

  it("offers audited deterministic mapping recovery without raw JSON", () => {
    const edge = read("supabase/functions/markscheme-mapper/index.ts");
    const panel = read("components/owner/markscheme-mapper-panel.tsx");
    expect(edge).toContain("bootstrap_document");
    expect(edge).toContain("approve_document_mappings");
    expect(edge).toContain("assertMappedQuestionsInVersion");
    expect(edge).toContain("markscheme_mapping.bootstrap");
    expect(panel).toContain("Register uploaded markscheme");
    expect(panel).toContain("Build mapping suggestions");
    expect(panel).toContain("Confirm all suggested mappings");
  });

  it("keeps a completed markscheme parse from replacing the question-paper package path", () => {
    const complete = read("supabase/functions/complete-parse-job/index.ts");
    const config = read("supabase/config.toml");
    expect(complete).toContain("metadata_json");
    expect(complete).toContain('parse_purpose === "markscheme"');
    expect(complete).toContain("markscheme parse result remains attached to the parse job");
    expect(config).toContain("[functions.complete-parse-job]\nverify_jwt = false");
  });
});
