"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function linkGuestAttemptToRosterAction(sessionId: string, formData: FormData) {
  const attemptId = String(formData.get("attempt_id") ?? "");
  const rosterEntryId = String(formData.get("roster_entry_id") ?? "");
  if (!attemptId || !rosterEntryId) throw new Error("attempt_id and roster_entry_id are required");
  const supabase = await createSupabaseServerClient();
  const { data: roster, error: rosterError } = await supabase
    .from("student_roster_entries")
    .select("id,student_profile_id")
    .eq("id", rosterEntryId)
    .single();
  if (rosterError) throw rosterError;
  const { error } = await supabase
    .from("attempts")
    .update({
      roster_entry_id: roster.id,
      assignee_profile_id: roster.student_profile_id,
      claim_status: roster.student_profile_id ? "linked" : "unclaimed",
      identity_review_status: "resolved",
    })
    .eq("id", attemptId)
    .eq("exam_session_id", sessionId);
  if (error) throw error;
  revalidatePath(`/owner/exam-sessions/${sessionId}/reconcile`);
}

export async function markGuestIdentityResolvedAction(sessionId: string, attemptId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("attempts")
    .update({ identity_review_status: "resolved" })
    .eq("id", attemptId)
    .eq("exam_session_id", sessionId);
  if (error) throw error;
  revalidatePath(`/owner/exam-sessions/${sessionId}/reconcile`);
}
