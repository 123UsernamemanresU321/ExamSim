"use server";

import { redirect } from "next/navigation";
import { auditInstitutionAction } from "@/lib/examsim/institution-audit";
import { requireInstitutionPermission } from "@/lib/examsim/institution-roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createPaperModeJobAction(formData: FormData) {
  const { ownerProfileId, profileId } = await requireInstitutionPermission("assessment_authoring");
  const [assessmentId, versionId] = String(formData.get("assessment_version_selection") ?? "").split("|");
  if (!assessmentId || !versionId) throw new Error("Select an assessment version.");
  const supabase = await createSupabaseServerClient();
  const { data: version, error: versionError } = await supabase
    .from("assessment_versions")
    .select("id,assessment_id,status,governance_status,assessments!inner(owner_profile_id,title)")
    .eq("id", versionId)
    .eq("assessment_id", assessmentId)
    .maybeSingle();
  if (versionError) throw versionError;
  const assessment = Array.isArray(version?.assessments) ? version?.assessments[0] : version?.assessments;
  if (!version || assessment?.owner_profile_id !== ownerProfileId) throw new Error("Assessment version is outside this institution.");
  if (version.status !== "published" && version.governance_status !== "approved") throw new Error("Paper Mode requires an approved or published assessment version.");
  const title = String(formData.get("title") ?? "").trim().slice(0, 160) || `${assessment.title} Paper Mode`;
  const durationMinutes = Math.max(1, Math.min(720, Math.floor(Number(formData.get("duration_minutes") ?? 60))));
  const { data: job, error } = await supabase.from("paper_mode_jobs").insert({
    owner_profile_id: ownerProfileId,
    assessment_id: assessmentId,
    assessment_version_id: versionId,
    title,
    duration_seconds: durationMinutes * 60,
    instructions: String(formData.get("instructions") ?? "").trim().slice(0, 2000) || null,
    created_by_profile_id: profileId,
  }).select("id").single();
  if (error) throw error;
  if (!job) throw new Error("Paper Mode job could not be created.");
  await auditInstitutionAction({ ownerProfileId, action: "paper_mode.job_created", targetTable: "paper_mode_jobs", targetId: job.id, metadata: { assessment_id: assessmentId, assessment_version_id: versionId } });
  redirect(`/owner/paper-mode/${job.id}`);
}
