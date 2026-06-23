"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditInstitutionAction } from "@/lib/examsim/institution-audit";
import { requireInstitutionPermission } from "@/lib/examsim/institution-roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

const TOOL_CODES = ["physical_calculator", "physical_materials", "tts", "desmos", "geogebra", "chemistry_editor"] as const;
type Requirement = "prohibited" | "allowed" | "required";

export async function saveAssessmentExamPolicyAction(assessmentId: string, sourceVersionId: string, formData: FormData) {
  const context = await requireInstitutionPermission("assessment_authoring");
  const supabase = await createSupabaseServerClient();
  const { data: sourceVersion, error: versionError } = await supabase
    .from("assessment_versions")
    .select("id,status,governance_status,assessment_id,assessments!inner(owner_profile_id)")
    .eq("id", sourceVersionId)
    .eq("assessment_id", assessmentId)
    .eq("assessments.owner_profile_id", context.ownerProfileId)
    .maybeSingle();
  if (versionError) throw versionError;
  if (!sourceVersion) throw new Error("Assessment version is outside this institution.");

  let targetVersionId = sourceVersion.id;
  const wasPublished = sourceVersion.status === "published" || sourceVersion.governance_status === "published";
  if (wasPublished) {
    const { data, error } = await supabase.rpc("clone_assessment_version_as_draft", { p_source_version_id: sourceVersion.id });
    if (error) throw error;
    if (!data) throw new Error("A draft version could not be created for this policy change.");
    targetVersionId = data;
  }

  const { data: resources, error: resourceError } = await supabase
    .from("resource_library_items")
    .select("id,title,material_type")
    .eq("owner_profile_id", context.ownerProfileId)
    .eq("status", "active");
  if (resourceError) throw resourceError;

  const selectedResources = (resources ?? []).flatMap((resource, index) => {
    const requirement = readResourceRequirement(formData.get(`resource_requirement_${resource.id}`));
    if (!requirement) return [];
    return [{
      assessment_id: assessmentId,
      assessment_version_id: targetVersionId,
      resource_library_item_id: resource.id,
      title: resource.title,
      material_type: resource.material_type,
      visibility_policy: readVisibility(formData.get(`resource_visibility_${resource.id}`)),
      requirement,
      sort_order: index,
    }];
  });

  const { error: deleteMaterialsError } = await supabase
    .from("assessment_materials")
    .delete()
    .eq("assessment_id", assessmentId)
    .eq("assessment_version_id", targetVersionId)
    .not("resource_library_item_id", "is", null);
  if (deleteMaterialsError) throw deleteMaterialsError;
  if (selectedResources.length) {
    const { error: materialInsertError } = await supabase.from("assessment_materials").insert(selectedResources);
    if (materialInsertError) throw materialInsertError;
  }

  const calculatorClass = readCalculatorClass(formData.get("physical_calculator_class"));
  const approvedMaterials = String(formData.get("physical_materials_items") ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 20);
  const configurations: Record<(typeof TOOL_CODES)[number], Json> = {
    physical_calculator: calculatorClass === "none" ? {} : { calculator_class: calculatorClass },
    physical_materials: approvedMaterials.length ? { items: approvedMaterials } : {},
    tts: {},
    desmos: {},
    geogebra: {},
    chemistry_editor: {},
  };
  const toolRows = TOOL_CODES.map((toolCode) => {
    const requirement = toolCode === "physical_calculator" && calculatorClass === "none"
      ? "prohibited"
      : toolCode === "physical_materials" && !approvedMaterials.length
        ? "prohibited"
        : readRequirement(formData.get(`tool_requirement_${toolCode}`));
    return {
      owner_profile_id: context.ownerProfileId,
      assessment_id: assessmentId,
      assessment_version_id: targetVersionId,
      tool_code: toolCode,
      requirement,
      configuration_json: configurations[toolCode],
      created_by_profile_id: context.profileId,
      updated_at: new Date().toISOString(),
    };
  });
  const { error: toolError } = await supabase
    .from("assessment_tool_policies")
    .upsert(toolRows, { onConflict: "assessment_version_id,tool_code" });
  if (toolError) throw toolError;

  await auditInstitutionAction({
    ownerProfileId: context.ownerProfileId,
    action: wasPublished ? "assessment_policy.draft_created" : "assessment_policy.updated",
    targetTable: "assessment_versions",
    targetId: targetVersionId,
    metadata: {
      assessment_id: assessmentId,
      source_version_id: sourceVersionId,
      resource_count: selectedResources.length,
      required_resources: selectedResources.filter((resource) => resource.requirement === "required").length,
      required_tools: toolRows.filter((tool) => tool.requirement === "required").map((tool) => tool.tool_code),
    },
  });
  revalidatePath(`/owner/assessments/${assessmentId}`);
  revalidatePath(`/owner/assessments/${assessmentId}/settings`);
  redirect(`/owner/assessments/${assessmentId}/settings?version=${targetVersionId}&saved=1${wasPublished ? "&draft_created=1" : ""}`);
}

function readRequirement(value: FormDataEntryValue | null): Requirement {
  return value === "required" || value === "allowed" ? value : "prohibited";
}

function readResourceRequirement(value: FormDataEntryValue | null): Exclude<Requirement, "prohibited"> | null {
  return value === "required" || value === "allowed" ? value : null;
}

function readVisibility(value: FormDataEntryValue | null): "before_exam" | "active_only" | "after_finish" | "always" {
  return value === "active_only" || value === "after_finish" || value === "always" ? value : "before_exam";
}

function readCalculatorClass(value: FormDataEntryValue | null) {
  return value === "basic" || value === "scientific" || value === "gdc" ? value : "none";
}
