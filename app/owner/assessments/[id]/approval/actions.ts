"use server";

import { revalidatePath } from "next/cache";
import { auditInstitutionAction } from "@/lib/examsim/institution-audit";
import { requireInstitutionPermission } from "@/lib/examsim/institution-roles";
import { asJson } from "@/lib/owner-operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const REVIEW_DECISIONS = ["reviewed", "approved", "rejected", "warning_acknowledged"] as const;
type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export async function reviewAssessmentVersionAction(assessmentId: string, versionId: string, formData: FormData) {
  const context = await requireInstitutionPermission("moderation");
  const decision = String(formData.get("decision") ?? "") as ReviewDecision;
  if (!REVIEW_DECISIONS.includes(decision)) throw new Error("Unsupported review decision.");
  const comments = String(formData.get("comments") ?? "").trim();
  const checklist = {
    question_structure: formData.get("question_structure") === "on",
    source_coverage: formData.get("source_coverage") === "on",
    marks_and_rubrics: formData.get("marks_and_rubrics") === "on",
    publish_health: formData.get("publish_health") === "on",
  };
  if (decision === "approved" && Object.values(checklist).some((checked) => !checked)) {
    throw new Error("Complete every approval checklist item before approving this version.");
  }

  const supabase = await createSupabaseServerClient();
  const { data: version, error: versionError } = await supabase
    .from("assessment_versions")
    .select("id,assessment_id,version_no,governance_status,assessments!inner(owner_profile_id)")
    .eq("id", versionId)
    .eq("assessment_id", assessmentId)
    .eq("assessments.owner_profile_id", context.ownerProfileId)
    .maybeSingle();
  if (versionError) throw versionError;
  if (!version) throw new Error("Assessment version not found.");

  const { data: newStatus, error: reviewError } = await supabase.rpc("review_assessment_version", {
    p_version_id: versionId,
    p_decision: decision,
    p_comments: comments || null,
    p_checklist_json: asJson(checklist),
  });
  if (reviewError) throw reviewError;

  await auditInstitutionAction({
    ownerProfileId: context.ownerProfileId,
    action: `assessment_version.${decision}`,
    targetTable: "assessment_versions",
    targetId: versionId,
    metadata: {
      assessment_id: assessmentId,
      version_no: version.version_no,
      previous_status: version.governance_status,
      new_status: newStatus,
      checklist,
    },
  });

  revalidatePath(`/owner/assessments/${assessmentId}`);
  revalidatePath(`/owner/assessments/${assessmentId}/approval`);
  revalidatePath(`/owner/assessments/${assessmentId}/publish`);
  revalidatePath(`/owner/assessments/${assessmentId}/history`);
}
