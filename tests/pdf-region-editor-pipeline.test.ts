import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("PDF visual question region editor pipeline", () => {
  it("lets owners upload a PDF source from authoring and creates source document/page records", () => {
    const actions = read("app/owner/assessments/[id]/authoring/actions.ts");
    const page = read("app/owner/assessments/[id]/authoring/page.tsx");
    expect(actions).toContain("uploadPdfSourceAction");
    expect(actions).toContain("PDFDocument.load");
    expect(actions).toContain('storage.from("assessment-sources").upload');
    expect(actions).toContain('from("source_documents").insert');
    expect(actions).toContain('from("source_pages").upsert');
    expect(actions).toContain("MAX_UPLOAD_BYTES");
    expect(actions).toContain("application/pdf");
    expect(page).toContain("Upload PDF Source");
    expect(page).toContain("Open PDF Region Editor");
    expect(page).toContain("Build Manually");
    expect(page).toContain("Advanced JSON Import");
  });

  it("renders uploaded PDFs directly with PDF.js and signs source_documents paths", () => {
    const editor = read("components/owner/source-region-editor.tsx");
    const signer = read("supabase/functions/owner-sign-storage-url/index.ts");
    expect(editor).toContain("pdfjs-dist");
    expect(editor).toContain("getDocument");
    expect(editor).toContain("<canvas");
    expect(editor).toContain('bucket: "assessment-sources"');
    expect(editor).toContain('purpose: "assessment_source"');
    expect(editor).toContain("selectedDocumentUrl");
    expect(signer).toContain('from("source_documents")');
    expect(signer).toContain('eq("object_path", objectPath)');
    expect(signer).toContain("sourceDocument?.owner_profile_id === ownerProfileId");
  });

  it("supports production region operations and question linking controls", () => {
    const actions = read("app/owner/assessments/[id]/authoring/actions.ts");
    const editor = read("components/owner/source-region-editor.tsx");
    const page = read("app/owner/assessments/[id]/authoring/page.tsx");
    expect(actions).toContain("duplicateSourceRegionAction");
    expect(actions).toContain("deleteSourceRegionAction");
    expect(actions).toContain("deleteSourceDocumentAction");
    expect(actions).toContain("createQuestionFromRegionAction");
    expect(actions).toContain("syncQuestionNodeSourceAnchor");
    expect(editor).toContain("Duplicate region");
    expect(editor).toContain("Delete region");
    expect(editor).toContain("Delete source PDF");
    expect(editor).toContain("Create question card");
    expect(editor).toContain("Marks");
    expect(editor).toContain("Response type");
    expect(editor).toContain("Notes");
    expect(page).toContain("Jump to PDF region");
  });

  it("adds health warnings for missing and unreviewed PDF source regions", () => {
    const health = read("lib/paper-health.ts");
    expect(health).toContain("question_source_regions");
    expect(health).toContain("source_region_unlinked");
    expect(health).toContain("source_region_low_confidence");
    expect(health).toContain("source_region_missing_marks");
    expect(health).toContain("source_region_missing_response_type");
    expect(health).toContain("source_region_overlap");
    expect(health).toContain("source_document_failed");
  });
});
