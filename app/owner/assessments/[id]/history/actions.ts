"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditInstitutionAction } from "@/lib/examsim/institution-audit";
import { requireInstitutionPermission } from "@/lib/examsim/institution-roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function duplicateAssessmentVersionAsDraftAction(assessmentId: string, sourceVersionId: string) {
  const context = await requireInstitutionPermission("assessment_authoring");
  const supabase = await createSupabaseServerClient();
  const { data: sourceVersion, error: sourceError } = await supabase
    .from("assessment_versions")
    .select("id,assessment_id,version_no,status,assessments!inner(owner_profile_id)")
    .eq("id", sourceVersionId)
    .eq("assessment_id", assessmentId)
    .eq("assessments.owner_profile_id", context.ownerProfileId)
    .maybeSingle();
  if (sourceError) throw sourceError;
  if (!sourceVersion) throw new Error("Assessment version not found.");

  const { data: draftVersionId, error: cloneError } = await supabase.rpc("clone_assessment_version_as_draft", {
    p_source_version_id: sourceVersionId,
  });
  if (cloneError) throw cloneError;
  if (!draftVersionId) throw new Error("The draft version could not be created.");

  await auditInstitutionAction({
    ownerProfileId: context.ownerProfileId,
    action: "assessment_version.duplicated_as_draft",
    targetTable: "assessment_versions",
    targetId: draftVersionId,
    metadata: {
      assessment_id: assessmentId,
      source_version_id: sourceVersionId,
      source_version_no: sourceVersion.version_no,
      source_status: sourceVersion.status,
    },
  });

  revalidatePath(`/owner/assessments/${assessmentId}`);
  revalidatePath(`/owner/assessments/${assessmentId}/history`);
  revalidatePath(`/owner/assessments/${assessmentId}/authoring`);
  redirect(`/owner/assessments/${assessmentId}/authoring?version=${draftVersionId}`);
}
