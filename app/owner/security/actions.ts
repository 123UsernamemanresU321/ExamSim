"use server";

import { revalidatePath } from "next/cache";
import { requireAppRole } from "@/lib/auth/server";
import { auditInstitutionAction } from "@/lib/examsim/institution-audit";
import { normalizeInstitutionRole } from "@/lib/examsim/institution-role-matrix";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function setInstitutionMembershipAction(formData: FormData) {
  const owner = await requireAppRole("owner", "/owner/security");
  if (!owner) throw new Error("Owner profile required");
  const supabase = await createSupabaseServerClient();
  await requireAal2(supabase);
  const memberProfileId = String(formData.get("member_profile_id") ?? "").trim();
  const role = normalizeInstitutionRole(String(formData.get("role") ?? ""));
  if (!memberProfileId || !role) throw new Error("Account and role are required");
  if (memberProfileId === owner.id) throw new Error("The primary owner role cannot be changed here");

  const { data: member, error: memberError } = await supabase
    .from("profiles")
    .select("id,display_name")
    .eq("id", memberProfileId)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!member) throw new Error("Account not found");

  const { data: activeMembership, error: membershipError } = await supabase
    .from("institution_memberships")
    .select("id,role")
    .eq("owner_profile_id", owner.id)
    .eq("member_profile_id", memberProfileId)
    .eq("status", "active")
    .maybeSingle();
  if (membershipError) throw membershipError;

  const mutation = activeMembership
    ? supabase.from("institution_memberships").update({ role, updated_at: new Date().toISOString() }).eq("id", activeMembership.id)
    : supabase.from("institution_memberships").insert({
        owner_profile_id: owner.id,
        member_profile_id: memberProfileId,
        role,
        status: "active",
        display_label: member.display_name,
        created_by_profile_id: owner.id,
      });
  const { error } = await mutation;
  if (error) throw error;
  await auditInstitutionAction({
    ownerProfileId: owner.id,
    action: activeMembership ? "institution_membership.role_changed" : "institution_membership.granted",
    targetTable: "institution_memberships",
    targetId: activeMembership?.id ?? memberProfileId,
    metadata: { member_profile_id: memberProfileId, previous_role: activeMembership?.role ?? null, role },
  });
  revalidatePath("/owner/security");
}

export async function disableInstitutionMembershipAction(membershipId: string) {
  const owner = await requireAppRole("owner", "/owner/security");
  if (!owner) throw new Error("Owner profile required");
  const supabase = await createSupabaseServerClient();
  await requireAal2(supabase);
  const { error } = await supabase
    .from("institution_memberships")
    .update({ status: "disabled", updated_at: new Date().toISOString() })
    .eq("id", membershipId)
    .eq("owner_profile_id", owner.id);
  if (error) throw error;
  await auditInstitutionAction({ ownerProfileId: owner.id, action: "institution_membership.disabled", targetTable: "institution_memberships", targetId: membershipId });
  revalidatePath("/owner/security");
}

async function requireAal2(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  if (data.currentLevel !== "aal2") throw new Error("Owner MFA/AAL2 is required to change institution roles");
}
