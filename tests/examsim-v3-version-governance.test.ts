import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertAssessmentVersionMutable,
  buildAssessmentVersionDiff,
  isAssessmentVersionMutable,
  shouldDeleteSharedSourceObject,
} from "@/lib/examsim/version-governance";
import { validatePublishHealth } from "../supabase/functions/_shared/publish-health";

describe("Examsim V3 assessment version governance", () => {
  it("allows draft review work but freezes published and archived versions", () => {
    expect(isAssessmentVersionMutable("draft")).toBe(true);
    expect(isAssessmentVersionMutable("review_required")).toBe(true);
    expect(isAssessmentVersionMutable("published")).toBe(false);
    expect(isAssessmentVersionMutable("archived")).toBe(false);
    expect(() => assertAssessmentVersionMutable("published")).toThrow(/published versions are frozen/i);
  });

  it("enforces immutability in visual authoring and provider mutation boundaries", () => {
    const authoring = readFileSync("app/owner/assessments/[id]/authoring/actions.ts", "utf8");
    const aiParse = readFileSync("supabase/functions/ai-parse-assessment/index.ts", "utf8");
    const mineru = readFileSync("supabase/functions/mineru-submit-hosted-job/index.ts", "utf8");
    const simpleTex = readFileSync("supabase/functions/simpletex-ocr-source-page/index.ts", "utf8");
    expect(authoring).toContain("assertAssessmentVersionMutable");
    expect(aiParse).toContain("assertVersionMutable");
    expect(mineru).toContain("assertVersionMutable");
    expect(simpleTex).toContain("assertVersionMutable");
  });

  it("renders published authoring versions as read-only", () => {
    const page = readFileSync("app/owner/assessments/[id]/authoring/page.tsx", "utf8");
    expect(page).toContain("Published versions are read-only");
    expect(page).toContain("isAssessmentVersionMutable");
    expect(page).toContain("readOnly");
  });

  it("binds publishing to the exact owned assessment version and server health checks", () => {
    const publish = readFileSync("supabase/functions/publish-assessment/index.ts", "utf8");
    expect(publish).toContain('requireInstitutionAal2(request, "session_publishing")');
    expect(publish).toContain('.eq("assessment_id", body.assessment_id)');
    expect(publish).toContain("validatePublishHealth");
    expect(publish).toContain("publish_health_blocked");
  });

  it("blocks critical unreviewed source and markscheme issues before publish", () => {
    const blockers = validatePublishHealth({
      questionNodes: [{ id: "q1", node_key: "Q1", node_type: "question", marks: 4, response_mode: "typed_text" }],
      sourceRegions: [{ id: "r1", question_node_id: null, region_type: "question", status: "needs_review", confidence: 0.4, metadata_json: {} }],
      markschemeNodes: [{ status: "needs_review", mapped_question_node_id: null }],
    });
    expect(blockers.join(" ")).toContain("critical low-confidence");
    expect(blockers.join(" ")).toContain("not linked");
    expect(blockers.join(" ")).toContain("markscheme");
  });

  it("builds a field-level historical diff for teacher review", () => {
    const diff = buildAssessmentVersionDiff({
      fromQuestions: [{ node_key: "Q1", title: "Old", marks: 4, response_mode: "typed_text", prompt_html: "Old prompt", prompt_latex: null }],
      toQuestions: [{ node_key: "Q1", title: "New", marks: 5, response_mode: "typed_or_upload", prompt_html: "New prompt", prompt_latex: null }],
      fromRegionCount: 1,
      toRegionCount: 2,
      fromRubricMarks: 4,
      toRubricMarks: 5,
      fromTopicKeys: ["Algebra"],
      toTopicKeys: ["Functions"],
    });
    expect(diff.changedQuestionKeys).toEqual(["Q1"]);
    expect(diff.changedFields).toEqual(expect.arrayContaining(["question_text", "marks", "response_type", "source_regions", "rubrics", "topics"]));
  });

  it("provides an audited restore-as-new-draft workflow and history route", () => {
    const migration = readdirSync("supabase/migrations")
      .map((file) => readFileSync(`supabase/migrations/${file}`, "utf8"))
      .find((source) => source.includes("clone_assessment_version_as_draft"));
    expect(migration).toContain("create or replace function public.clone_assessment_version_as_draft");
    expect(migration).toContain("has_institution_permission");
    expect(migration).toContain("_clone_question_map");
    expect(migration).not.toMatch(/to\s+anon/i);

    const actions = readFileSync("app/owner/assessments/[id]/history/actions.ts", "utf8");
    const page = readFileSync("app/owner/assessments/[id]/history/page.tsx", "utf8");
    expect(actions).toContain('requireInstitutionPermission("assessment_authoring")');
    expect(actions).toContain('rpc("clone_assessment_version_as_draft"');
    expect(actions).toContain("auditInstitutionAction");
    expect(page).toContain("Version history");
    expect(page).toContain("Duplicate as new draft");
    expect(page).toContain("buildAssessmentVersionDiff");
  });

  it("preserves shared private source objects while another version references them", () => {
    expect(shouldDeleteSharedSourceObject({ sourceDocumentReferences: 0, versionReferences: 0 })).toBe(true);
    expect(shouldDeleteSharedSourceObject({ sourceDocumentReferences: 1, versionReferences: 0 })).toBe(false);
    expect(shouldDeleteSharedSourceObject({ sourceDocumentReferences: 0, versionReferences: 1 })).toBe(false);
    const actions = readFileSync("app/owner/assessments/[id]/authoring/actions.ts", "utf8");
    expect(actions).toContain("shouldDeleteSharedSourceObject");
    expect(actions).toContain('eq("object_path", sourceDocument.object_path)');
    expect(actions).toContain('eq("source_object_path", sourceDocument.object_path)');
  });

  it("requires an audited review and approval stage before publishing", () => {
    const migrations = readdirSync("supabase/migrations").map((file) => readFileSync(`supabase/migrations/${file}`, "utf8")).join("\n");
    const actions = readFileSync("app/owner/assessments/[id]/approval/actions.ts", "utf8");
    const page = readFileSync("app/owner/assessments/[id]/approval/page.tsx", "utf8");
    const publish = readFileSync("supabase/functions/publish-assessment/index.ts", "utf8");
    expect(migrations).toContain("assessment_version_reviews");
    expect(migrations).toContain("governance_status");
    expect(migrations).toContain("has_institution_permission");
    expect(actions).toContain('requireInstitutionPermission("moderation")');
    expect(actions).toContain("auditInstitutionAction");
    expect(page).toContain("Publishing approval");
    expect(page).toContain("Reviewer comments");
    expect(publish).toContain('version.governance_status !== "approved"');
    expect(publish).toContain('governance_status: "published"');
  });
});
