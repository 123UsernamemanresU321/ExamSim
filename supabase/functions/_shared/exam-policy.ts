import { getAdminClient } from "./supabase.ts";

type AdminClient = ReturnType<typeof getAdminClient>;
type Requirement = "prohibited" | "allowed" | "required";

export type EdgeAssessmentExamPolicy = {
  resources: Array<{
    assignmentId: string;
    resourceId: string;
    title: string;
    materialType: string;
    requirement: Requirement;
    visibility: string;
  }>;
  tools: Array<{
    code: string;
    requirement: Requirement;
    configuration: Record<string, unknown>;
  }>;
  allowedMaterials: string[];
};

export async function loadAssessmentExamPolicy(
  admin: AdminClient,
  assessmentId: string,
  assessmentVersionId: string,
): Promise<EdgeAssessmentExamPolicy> {
  const [{ data: materials, error: materialError }, { data: tools, error: toolError }] = await Promise.all([
    admin.from("assessment_materials")
      .select("id,resource_library_item_id,title,material_type,requirement,visibility_policy")
      .eq("assessment_id", assessmentId)
      .eq("assessment_version_id", assessmentVersionId)
      .order("sort_order", { ascending: true }),
    admin.from("assessment_tool_policies")
      .select("tool_code,requirement,configuration_json")
      .eq("assessment_id", assessmentId)
      .eq("assessment_version_id", assessmentVersionId)
      .order("tool_code", { ascending: true }),
  ]);
  if (materialError) throw materialError;
  if (toolError) throw toolError;

  const toolRows = (tools ?? []).map((tool) => ({
    code: String(tool.tool_code),
    requirement: normalizeRequirement(tool.requirement),
    configuration: isRecord(tool.configuration_json) ? tool.configuration_json : {},
  }));
  const physicalMaterials = toolRows.find((tool) => tool.code === "physical_materials");
  return {
    resources: (materials ?? []).map((material) => ({
      assignmentId: String(material.id),
      resourceId: String(material.resource_library_item_id ?? material.id),
      title: String(material.title),
      materialType: String(material.material_type),
      requirement: material.requirement === "required" ? "required" : "allowed",
      visibility: String(material.visibility_policy),
    })),
    tools: toolRows,
    allowedMaterials: readStringArray(physicalMaterials?.configuration.items),
  };
}

export function resolveSessionExamPolicy(
  policy: EdgeAssessmentExamPolicy,
  settingsJson: unknown,
  accessibilityExceptions?: { tts?: boolean },
): EdgeAssessmentExamPolicy {
  const settings = isRecord(settingsJson) ? settingsJson : {};
  const overrides = isRecord(settings.exam_policy_overrides) ? settings.exam_policy_overrides : {};
  const resourceOverrides = isRecord(overrides.resource_requirements) ? overrides.resource_requirements : {};
  const toolOverrides = isRecord(overrides.tool_requirements) ? overrides.tool_requirements : {};
  const resources = policy.resources.map((resource) => ({
    ...resource,
    requirement: tightenRequirement(resource.requirement, resourceOverrides[resource.assignmentId]),
  }));
  let tools = policy.tools.map((tool) => ({
    ...tool,
    configuration: { ...tool.configuration },
    requirement: tightenRequirement(tool.requirement, toolOverrides[tool.code]),
  }));

  if (!tools.length) tools = legacySessionTools(settings);
  if (accessibilityExceptions?.tts) {
    const existing = tools.find((tool) => tool.code === "tts");
    if (existing) {
      if (existing.requirement === "prohibited") existing.requirement = "allowed";
    } else {
      tools.push({ code: "tts", requirement: "allowed", configuration: {} });
    }
  }
  const physicalMaterials = tools.find((tool) => tool.code === "physical_materials");
  return {
    resources,
    tools,
    allowedMaterials: physicalMaterials ? readStringArray(physicalMaterials.configuration.items) : [...policy.allowedMaterials],
  };
}

export function buildEdgeExamPolicySnapshot(
  assessmentVersionId: string,
  policy: EdgeAssessmentExamPolicy,
  capturedAt = new Date().toISOString(),
) {
  return {
    assessmentVersionId,
    capturedAt,
    resources: policy.resources.map((resource) => ({ ...resource })),
    tools: policy.tools.map((tool) => ({ ...tool, configuration: { ...tool.configuration } })),
    allowedMaterials: [...policy.allowedMaterials],
  };
}

export function safeExamPolicySummary(value: unknown) {
  const policy = isRecord(value) ? value : {};
  const resources = Array.isArray(policy.resources) ? policy.resources.filter(isRecord) : [];
  const tools = Array.isArray(policy.tools) ? policy.tools.filter(isRecord) : [];
  return {
    resources: resources.map((resource) => ({
      id: String(resource.assignmentId ?? ""),
      title: String(resource.title ?? "Resource"),
      material_type: String(resource.materialType ?? "reference"),
      requirement: normalizeRequirement(resource.requirement),
    })),
    tools: tools.map((tool) => ({
      code: String(tool.code ?? ""),
      requirement: normalizeRequirement(tool.requirement),
      configuration: safeToolConfiguration(tool.configuration),
    })),
    allowed_materials: readStringArray(policy.allowedMaterials),
  };
}

function legacySessionTools(settings: Record<string, unknown>) {
  const accommodations = isRecord(settings.accommodations) ? settings.accommodations : {};
  const tools: EdgeAssessmentExamPolicy["tools"] = [];
  const calculator = typeof accommodations.calculator_policy === "string" ? accommodations.calculator_policy : "none";
  if (calculator !== "none") {
    tools.push({
      code: "physical_calculator",
      requirement: "allowed",
      configuration: { calculator_class: calculator === "graphing" ? "gdc" : calculator },
    });
  }
  for (const [field, code] of [
    ["tts_allowed", "tts"],
    ["desmos_allowed", "desmos"],
    ["geogebra_allowed", "geogebra"],
    ["chemistry_editor_allowed", "chemistry_editor"],
  ] as const) {
    if (accommodations[field] === true) tools.push({ code, requirement: "allowed", configuration: {} });
  }
  const items = readStringArray(accommodations.allowed_materials);
  if (items.length) tools.push({ code: "physical_materials", requirement: "allowed", configuration: { items } });
  return tools;
}

function tightenRequirement(base: Requirement, requested: unknown): Requirement {
  if (base === "required" || base === "prohibited") return base;
  return requested === "prohibited" ? "prohibited" : "allowed";
}

function normalizeRequirement(value: unknown): Requirement {
  return value === "required" || value === "allowed" ? value : "prohibited";
}

function safeToolConfiguration(value: unknown) {
  if (!isRecord(value)) return {};
  const output: Record<string, string | string[]> = {};
  if (["basic", "scientific", "gdc"].includes(String(value.calculator_class))) {
    output.calculator_class = String(value.calculator_class);
  }
  const items = readStringArray(value.items);
  if (items.length) output.items = items;
  return output;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 20)
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
