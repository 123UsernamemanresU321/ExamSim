"use server";

import { revalidatePath } from "next/cache";
import { auditInstitutionAction } from "@/lib/examsim/institution-audit";
import { requireInstitutionPermission } from "@/lib/examsim/institution-roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function linkGuestAttemptToRosterAction(sessionId: string, formData: FormData) {
  const { ownerProfileId } = await requireInstitutionPermission("student_management");
  const attemptId = String(formData.get("attempt_id") ?? "");
  const rosterEntryId = String(formData.get("roster_entry_id") ?? "");
  if (!attemptId || !rosterEntryId) throw new Error("attempt_id and roster_entry_id are required");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("institution_link_guest_attempt", {
    p_owner_profile_id: ownerProfileId,
    p_exam_session_id: sessionId,
    p_attempt_id: attemptId,
    p_roster_entry_id: rosterEntryId,
  });
  if (error) throw error;
  await auditInstitutionAction({ ownerProfileId, action: "attempt.identity_linked", targetTable: "attempts", targetId: attemptId, metadata: { roster_entry_id: rosterEntryId } });
  revalidatePath(`/owner/exam-sessions/${sessionId}/reconcile`);
}

export async function markGuestIdentityResolvedAction(sessionId: string, attemptId: string) {
  const { ownerProfileId } = await requireInstitutionPermission("student_management");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("institution_resolve_guest_identity", {
    p_owner_profile_id: ownerProfileId,
    p_exam_session_id: sessionId,
    p_attempt_id: attemptId,
  });
  if (error) throw error;
  await auditInstitutionAction({ ownerProfileId, action: "attempt.identity_resolved", targetTable: "attempts", targetId: attemptId });
  revalidatePath(`/owner/exam-sessions/${sessionId}/reconcile`);
}

export async function approveAttemptClaimAction(sessionId: string, attemptId: string) {
  const { ownerProfileId } = await requireInstitutionPermission("student_management");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("institution_review_attempt_claim", {
    p_owner_profile_id: ownerProfileId,
    p_exam_session_id: sessionId,
    p_attempt_id: attemptId,
    p_decision: "approve",
  });
  if (error) throw error;
  await auditInstitutionAction({ ownerProfileId, action: "attempt.claim_approved", targetTable: "attempts", targetId: attemptId });
  revalidatePath(`/owner/exam-sessions/${sessionId}/reconcile`);
}

export async function rejectAttemptClaimAction(sessionId: string, attemptId: string) {
  const { ownerProfileId } = await requireInstitutionPermission("student_management");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("institution_review_attempt_claim", {
    p_owner_profile_id: ownerProfileId,
    p_exam_session_id: sessionId,
    p_attempt_id: attemptId,
    p_decision: "reject",
  });
  if (error) throw error;
  await auditInstitutionAction({ ownerProfileId, action: "attempt.claim_rejected", targetTable: "attempts", targetId: attemptId });
  revalidatePath(`/owner/exam-sessions/${sessionId}/reconcile`);
}
