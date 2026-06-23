import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildExamPolicySnapshot,
  resolveSessionPolicy,
  type AssessmentExamPolicy,
} from "@/lib/examsim/exam-policy";

const assessmentPolicy: AssessmentExamPolicy = {
  resources: [
    {
      assignmentId: "assignment-formula",
      resourceId: "resource-formula",
      title: "Mathematics AA HL formula booklet",
      materialType: "formula_booklet",
      requirement: "required",
      visibility: "before_exam",
    },
  ],
  tools: [
    {
      code: "physical_calculator",
      requirement: "required",
      configuration: { calculator_class: "gdc" },
    },
    { code: "desmos", requirement: "prohibited", configuration: {} },
    { code: "tts", requirement: "prohibited", configuration: {} },
  ],
  allowedMaterials: ["Ruler"],
};

describe("assessment exam resource policy", () => {
  it("does not let a session remove a requirement or add a prohibited tool", () => {
    const resolved = resolveSessionPolicy(assessmentPolicy, {
      resourceRequirements: { "assignment-formula": "prohibited" },
      toolRequirements: {
        physical_calculator: "allowed",
        desmos: "allowed",
      },
    });

    expect(resolved.resources[0].requirement).toBe("required");
    expect(resolved.tools.find((tool) => tool.code === "physical_calculator")?.requirement).toBe("required");
    expect(resolved.tools.find((tool) => tool.code === "desmos")?.requirement).toBe("prohibited");
  });

  it("lets a session prohibit an item that was merely allowed", () => {
    const resolved = resolveSessionPolicy(
      {
        ...assessmentPolicy,
        tools: [{ code: "desmos", requirement: "allowed", configuration: {} }],
      },
      { toolRequirements: { desmos: "prohibited" } },
    );

    expect(resolved.tools[0].requirement).toBe("prohibited");
  });

  it("allows only accessibility tool exceptions for an individual student", () => {
    const resolved = resolveSessionPolicy(assessmentPolicy, undefined, {
      tts: true,
      desmos: true,
      geogebra: true,
      chemistry_editor: true,
    } as unknown as { tts?: boolean });

    expect(resolved.tools.find((tool) => tool.code === "tts")?.requirement).toBe("allowed");
    expect(resolved.tools.find((tool) => tool.code === "desmos")?.requirement).toBe("prohibited");
    expect(resolved.tools.some((tool) => tool.code === "geogebra")).toBe(false);
    expect(resolved.tools.some((tool) => tool.code === "chemistry_editor")).toBe(false);
  });

  it("does not downgrade globally required TTS when applying an accessibility exception", () => {
    const resolved = resolveSessionPolicy(
      {
        ...assessmentPolicy,
        tools: [{ code: "tts", requirement: "required", configuration: {} }],
      },
      undefined,
      { tts: true },
    );

    expect(resolved.tools[0].requirement).toBe("required");
  });

  it("keeps required TTS in the Edge policy resolver", () => {
    const source = readFileSync("supabase/functions/_shared/exam-policy.ts", "utf8");
    expect(source).toContain('if (existing.requirement === "prohibited") existing.requirement = "allowed"');
    expect(source).toContain("} else {\n      tools.push({ code: \"tts\", requirement: \"allowed\", configuration: {} });");
  });

  it("creates a detached immutable attempt snapshot", () => {
    const snapshot = buildExamPolicySnapshot({
      assessmentVersionId: "version-1",
      policy: assessmentPolicy,
      capturedAt: "2026-06-22T12:00:00.000Z",
    });

    assessmentPolicy.resources[0].title = "Changed after publish";
    assessmentPolicy.tools[0].configuration.calculator_class = "scientific";

    expect(snapshot.assessmentVersionId).toBe("version-1");
    expect(snapshot.capturedAt).toBe("2026-06-22T12:00:00.000Z");
    expect(snapshot.resources[0].title).toBe("Mathematics AA HL formula booklet");
    expect(snapshot.tools[0].configuration.calculator_class).toBe("gdc");
  });

  it("snapshots canonical policy in authenticated and guest attempt creation", () => {
    const publish = readFileSync("supabase/functions/publish-assessment/index.ts", "utf8");
    const join = readFileSync("supabase/functions/join-exam-session/index.ts", "utf8");
    for (const source of [publish, join]) {
      expect(source).toContain("loadAssessmentExamPolicy");
      expect(source).toContain("buildEdgeExamPolicySnapshot");
      expect(source).toContain("exam_policy_json");
    }
    expect(join).toContain("resolveSessionExamPolicy");
  });

  it("creates exam-code sessions only from frozen published versions", () => {
    const loader = readFileSync("lib/examsim/session-data.ts", "utf8");
    const action = readFileSync("app/owner/exam-sessions/actions.ts", "utf8");
    const join = readFileSync("supabase/functions/join-exam-session/index.ts", "utf8");
    expect(loader).toContain('.eq("status", "published")');
    expect(action).toContain('version.status !== "published"');
    expect(action).toContain("Exam sessions require a published assessment version");
    expect(join).toContain("session_version_not_published");
    expect(join).toContain('sessionVersion.status !== "published"');
  });

  it("returns only a safe policy summary from both state endpoints", () => {
    const authenticated = readFileSync("supabase/functions/get-attempt-state/index.ts", "utf8");
    const guest = readFileSync("supabase/functions/guest-get-attempt-state/index.ts", "utf8");
    for (const source of [authenticated, guest]) {
      expect(source).toContain("safeExamPolicySummary");
      expect(source).toContain("exam_policy_summary");
    }
  });
});
