import type { Json } from "@/types/database";

export type ExamPolicyRequirement = "prohibited" | "allowed" | "required";
export type ExamToolCode = "physical_calculator" | "physical_materials" | "tts" | "desmos" | "geogebra" | "chemistry_editor";
export type ExamMaterialType = "formula_booklet" | "data_booklet" | "annex" | "instructions" | "reference" | "other";

export type AssessmentResourcePolicy = {
  assignmentId: string;
  resourceId: string;
  title: string;
  materialType: ExamMaterialType;
  requirement: ExamPolicyRequirement;
  visibility: "before_exam" | "active_only" | "after_finish" | "always";
};

export type AssessmentToolPolicy = {
  code: ExamToolCode;
  requirement: ExamPolicyRequirement;
  configuration: Record<string, Json | undefined>;
};

export type AssessmentExamPolicy = {
  resources: AssessmentResourcePolicy[];
  tools: AssessmentToolPolicy[];
  allowedMaterials: string[];
};

export type SessionPolicyOverrides = {
  resourceRequirements?: Record<string, ExamPolicyRequirement | undefined>;
  toolRequirements?: Partial<Record<ExamToolCode, ExamPolicyRequirement>>;
};

export type AccessibilityToolExceptions = {
  tts?: boolean;
};

export type ExamPolicySnapshot = AssessmentExamPolicy & {
  assessmentVersionId: string;
  capturedAt: string;
};

export type ExamPolicySummary = {
  resources: Array<{
    id: string;
    title: string;
    material_type: string;
    requirement: ExamPolicyRequirement;
  }>;
  tools: Array<{
    code: string;
    requirement: ExamPolicyRequirement;
    configuration: Record<string, string | string[]>;
  }>;
  allowed_materials: string[];
};

export const EMPTY_ASSESSMENT_EXAM_POLICY: AssessmentExamPolicy = {
  resources: [],
  tools: [],
  allowedMaterials: [],
};

export function resolveSessionPolicy(
  assessmentPolicy: AssessmentExamPolicy,
  sessionOverrides?: SessionPolicyOverrides,
  accessibilityExceptions?: AccessibilityToolExceptions,
): AssessmentExamPolicy {
  const resources = assessmentPolicy.resources.map((resource) => {
    const requested = sessionOverrides?.resourceRequirements?.[resource.assignmentId];
    return {
      ...resource,
      requirement: tightenToolRequirement(resource.requirement, requested),
    };
  });

  const tools = assessmentPolicy.tools.map((tool) => {
    const requested = sessionOverrides?.toolRequirements?.[tool.code];
    let requirement = tightenToolRequirement(tool.requirement, requested);
    if (tool.code === "tts" && accessibilityExceptions?.tts && requirement === "prohibited") requirement = "allowed";
    return { ...tool, configuration: structuredClone(tool.configuration), requirement };
  });

  if (accessibilityExceptions?.tts && !tools.some((tool) => tool.code === "tts")) {
    tools.push({ code: "tts", requirement: "allowed", configuration: {} });
  }

  return {
    resources,
    tools,
    allowedMaterials: [...assessmentPolicy.allowedMaterials],
  };
}

export function buildExamPolicySnapshot({
  assessmentVersionId,
  policy,
  capturedAt = new Date().toISOString(),
}: {
  assessmentVersionId: string;
  policy: AssessmentExamPolicy;
  capturedAt?: string;
}): ExamPolicySnapshot {
  return {
    assessmentVersionId,
    capturedAt,
    resources: policy.resources.map((resource) => ({ ...resource })),
    tools: policy.tools.map((tool) => ({ ...tool, configuration: structuredClone(tool.configuration) })),
    allowedMaterials: [...policy.allowedMaterials],
  };
}

export function applyExamPolicyToAccommodation<T extends {
  calculator_policy: "none" | "basic" | "scientific" | "graphing";
  formula_booklet_allowed: boolean;
  allowed_materials: string[];
  tts_allowed: boolean;
  desmos_allowed: boolean;
  geogebra_allowed: boolean;
  chemistry_editor_allowed: boolean;
}>(accommodation: T, summary?: ExamPolicySummary | null): T {
  if (!summary?.tools.length && !summary?.resources.length && !summary?.allowed_materials.length) return accommodation;
  const toolByCode = new Map(summary.tools.map((tool) => [tool.code, tool]));
  const calculator = toolByCode.get("physical_calculator");
  const calculatorClass = calculator?.configuration.calculator_class;
  const enabled = (code: string) => {
    const tool = toolByCode.get(code);
    return Boolean(tool && tool.requirement !== "prohibited");
  };
  return {
    ...accommodation,
    calculator_policy: calculator && calculator.requirement !== "prohibited"
      ? calculatorClass === "gdc"
        ? "graphing"
        : calculatorClass === "basic" || calculatorClass === "scientific"
          ? calculatorClass
          : "none"
      : "none",
    formula_booklet_allowed: false,
    allowed_materials: [...summary.allowed_materials],
    tts_allowed: accommodation.tts_allowed || enabled("tts"),
    desmos_allowed: enabled("desmos"),
    geogebra_allowed: enabled("geogebra"),
    chemistry_editor_allowed: enabled("chemistry_editor"),
  };
}

function tightenToolRequirement(
  base: ExamPolicyRequirement,
  requested: ExamPolicyRequirement | undefined,
): ExamPolicyRequirement {
  if (base === "required" || base === "prohibited") return base;
  return requested === "prohibited" ? "prohibited" : "allowed";
}
