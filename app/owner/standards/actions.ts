"use server";

import { revalidatePath } from "next/cache";
import { auditInstitutionAction } from "@/lib/examsim/institution-audit";
import { requireInstitutionPermission } from "@/lib/examsim/institution-roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SAMPLE_FRAMEWORKS = [
  {
    code: "IB",
    name: "IB sample starter",
    version: "sample-2026",
    description: "Illustrative starter only. Replace or verify against the school's licensed IB subject guide.",
    standards: [
      ["IB.AA.HL.CALC", "Calculus", "Mathematics", "HL"],
      ["IB.CHEM.STRUCT", "Structure and bonding", "Chemistry", "DP"],
    ],
  },
  {
    code: "MYP",
    name: "MYP sample starter",
    version: "sample-2026",
    description: "Illustrative MYP starter for local configuration and validation.",
    standards: [
      ["MYP.MATH.REASON", "Reasoning and proof", "Mathematics", "MYP 5"],
      ["MYP.SCI.INQUIRE", "Scientific inquiry", "Science", "MYP 5"],
    ],
  },
  {
    code: "IGCSE",
    name: "IGCSE sample starter",
    version: "sample-2026",
    description: "Illustrative IGCSE starter. Verify codes against the board and syllabus used by the school.",
    standards: [
      ["IGCSE.MATH.ALG", "Algebra", "Mathematics", "IGCSE"],
      ["IGCSE.PHY.MECH", "Mechanics", "Physics", "IGCSE"],
    ],
  },
  {
    code: "OLYMPIAD",
    name: "Olympiad/SAMO sample starter",
    version: "sample-2026",
    description: "Illustrative problem-solving tree for Olympiad/SAMO-style local tagging.",
    standards: [
      ["OLY.NT", "Number theory", "Mathematics", "Olympiad"],
      ["OLY.GEO", "Euclidean geometry", "Mathematics", "Olympiad"],
    ],
  },
] as const;

export async function seedSampleStandardsAction() {
  const { ownerProfileId, profileId } = await requireInstitutionPermission("assessment_authoring");
  const supabase = await createSupabaseServerClient();
  for (const sample of SAMPLE_FRAMEWORKS) {
    const { data: framework, error: frameworkError } = await supabase
      .from("curriculum_frameworks")
      .upsert({
        owner_profile_id: ownerProfileId,
        code: sample.code,
        name: sample.name,
        version: sample.version,
        description: sample.description,
        review_status: "draft",
        created_by_profile_id: profileId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "owner_profile_id,code,version" })
      .select("id")
      .single();
    if (frameworkError) throw frameworkError;
    const { error: standardsError } = await supabase.from("curriculum_standards").upsert(
      sample.standards.map(([code, title, subject, level], sortOrder) => ({
        owner_profile_id: ownerProfileId,
        framework_id: framework.id,
        code,
        title,
        subject,
        level,
        sort_order: sortOrder,
        standard_kind: "topic",
        review_status: "draft",
      })),
      { onConflict: "framework_id,code" },
    );
    if (standardsError) throw standardsError;
    await auditInstitutionAction({
      ownerProfileId,
      action: "curriculum_standard.seeded",
      targetTable: "curriculum_frameworks",
      targetId: framework.id,
      metadata: { framework: sample.code, version: sample.version, sample: true },
    });
  }
  revalidatePath("/owner/standards");
}

export async function createCurriculumFrameworkAction(formData: FormData) {
  const { ownerProfileId, profileId } = await requireInstitutionPermission("assessment_authoring");
  const code = required(formData, "code").toUpperCase().slice(0, 32);
  const name = required(formData, "name").slice(0, 120);
  const version = required(formData, "version").slice(0, 60);
  const description = String(formData.get("description") ?? "").trim().slice(0, 500) || null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("curriculum_frameworks").insert({
    owner_profile_id: ownerProfileId,
    code,
    name,
    version,
    description,
    review_status: "active",
    approved_by_profile_id: profileId,
    approved_at: new Date().toISOString(),
    created_by_profile_id: profileId,
  }).select("id").single();
  if (error) throw error;
  await auditInstitutionAction({ ownerProfileId, action: "curriculum_framework.created", targetTable: "curriculum_frameworks", targetId: data.id });
  revalidatePath("/owner/standards");
}

export async function createCurriculumStandardAction(formData: FormData) {
  const { ownerProfileId, profileId } = await requireInstitutionPermission("assessment_authoring");
  const frameworkId = required(formData, "framework_id");
  const parentStandardId = String(formData.get("parent_standard_id") ?? "").trim() || null;
  const sourceDocumentId = String(formData.get("source_document_id") ?? "").trim() || null;
  const supabase = await createSupabaseServerClient();
  const { data: framework, error: frameworkError } = await supabase
    .from("curriculum_frameworks")
    .select("id")
    .eq("id", frameworkId)
    .eq("owner_profile_id", ownerProfileId)
    .maybeSingle();
  if (frameworkError) throw frameworkError;
  if (!framework) throw new Error("Framework not found in this institution.");
  if (sourceDocumentId) {
    const { data: source, error: sourceError } = await supabase.from("curriculum_source_documents")
      .select("id")
      .eq("id", sourceDocumentId)
      .eq("owner_profile_id", ownerProfileId)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) throw new Error("Curriculum source is outside this institution.");
  }
  if (parentStandardId) {
    const { data: parent, error: parentError } = await supabase
      .from("curriculum_standards")
      .select("id")
      .eq("id", parentStandardId)
      .eq("framework_id", frameworkId)
      .eq("owner_profile_id", ownerProfileId)
      .maybeSingle();
    if (parentError) throw parentError;
    if (!parent) throw new Error("Parent standard does not belong to this framework.");
  }
  const { data, error } = await supabase.from("curriculum_standards").insert({
    owner_profile_id: ownerProfileId,
    framework_id: frameworkId,
    parent_standard_id: parentStandardId,
    code: required(formData, "code").slice(0, 80),
    title: required(formData, "title").slice(0, 180),
    subject: String(formData.get("subject") ?? "").trim().slice(0, 80) || null,
    level: String(formData.get("level") ?? "").trim().slice(0, 80) || null,
    description: String(formData.get("description") ?? "").trim().slice(0, 1000) || null,
    standard_kind: readStandardKind(formData.get("standard_kind")),
    source_document_id: sourceDocumentId,
    source_page_start: readPositiveInteger(formData.get("source_page_start")),
    source_page_end: readPositiveInteger(formData.get("source_page_end")),
    review_status: sourceDocumentId ? "draft" : "approved",
    reviewed_by_profile_id: sourceDocumentId ? null : profileId,
    reviewed_at: sourceDocumentId ? null : new Date().toISOString(),
  }).select("id").single();
  if (error) throw error;
  await auditInstitutionAction({ ownerProfileId, action: "curriculum_standard.created", targetTable: "curriculum_standards", targetId: data.id, metadata: { framework_id: frameworkId } });
  revalidatePath("/owner/standards");
}

export async function reviewCurriculumStandardsAction(decision: "approved" | "rejected", formData: FormData) {
  const { ownerProfileId } = await requireInstitutionPermission("assessment_authoring");
  const standardIds = [...new Set(formData.getAll("standard_id").map(String).filter(Boolean))];
  if (!standardIds.length) throw new Error("Select at least one draft node.");
  const supabase = await createSupabaseServerClient();
  const { data: changedCount, error } = await supabase.rpc("institution_review_curriculum_standards", {
    p_owner_profile_id: ownerProfileId,
    p_standard_ids: standardIds,
    p_decision: decision,
  });
  if (error) throw error;
  await auditInstitutionAction({
    ownerProfileId,
    action: "curriculum_standard.reviewed",
    targetTable: "curriculum_standards",
    metadata: { decision, standard_ids: standardIds, changed_count: Number(changedCount ?? 0) },
  });
  revalidatePath("/owner/standards");
}

function required(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function readStandardKind(value: FormDataEntryValue | null): "topic" | "subtopic" | "skill" | "assessment_objective" | "command_term" | "core_requirement" {
  const normalized = String(value);
  return normalized === "subtopic" || normalized === "skill" || normalized === "assessment_objective" || normalized === "command_term" || normalized === "core_requirement"
    ? normalized
    : "topic";
}

function readPositiveInteger(value: FormDataEntryValue | null) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
