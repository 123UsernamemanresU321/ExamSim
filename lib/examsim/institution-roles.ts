import "server-only";

import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/auth/server";
import { dashboardPathForRole } from "@/lib/auth/routing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isDemoModeEnabled } from "@/lib/runtime";
import {
  INSTITUTION_PERMISSION_KEYS,
  normalizeInstitutionRole,
  permissionsForInstitutionRole,
  roleHasInstitutionPermission,
  type InstitutionPermission,
  type InstitutionRole,
} from "@/lib/examsim/institution-role-matrix";

export type InstitutionPermissionContext = {
  profileId: string;
  ownerProfileId: string;
  role: InstitutionRole;
  permissions: InstitutionPermission[];
  displayName: string;
};

export async function getInstitutionPermissionContext(ownerProfileId?: string): Promise<InstitutionPermissionContext | null> {
  if (isDemoModeEnabled()) {
    return {
      profileId: "demo_owner",
      ownerProfileId: ownerProfileId ?? "demo_owner",
      role: "owner_admin",
      permissions: [...INSTITUTION_PERMISSION_KEYS],
      displayName: "Demo Owner",
    };
  }

  const { profile } = await getCurrentUserProfile();
  if (!profile) return null;

  if (profile.app_role === "owner" && (!ownerProfileId || ownerProfileId === profile.id)) {
    return {
      profileId: profile.id,
      ownerProfileId: profile.id,
      role: "owner_admin",
      permissions: [...INSTITUTION_PERMISSION_KEYS],
      displayName: profile.display_name,
    };
  }

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("institution_memberships")
    .select("owner_profile_id, role, status")
    .eq("member_profile_id", profile.id)
    .eq("status", "active");

  if (ownerProfileId) query = query.eq("owner_profile_id", ownerProfileId);

  const { data, error } = await query.order("updated_at", { ascending: false }).order("created_at", { ascending: false }).limit(1);
  if (error) throw new Error(`Unable to load institution role context: ${error.message}`);

  const membership = data?.[0];
  const role = normalizeInstitutionRole(membership?.role);
  if (!membership || !role) return null;

  return {
    profileId: profile.id,
    ownerProfileId: membership.owner_profile_id,
    role,
    permissions: permissionsForInstitutionRole(role),
    displayName: profile.display_name,
  };
}

export async function requireInstitutionContext(nextPath = "/owner") {
  const context = await getInstitutionPermissionContext();
  if (context) return context;

  const { user, profile } = await getCurrentUserProfile();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (profile) redirect(dashboardPathForRole(profile.app_role));
  redirect("/login");
}

export async function requireInstitutionPagePermission(permission: InstitutionPermission, nextPath: string) {
  const context = await requireInstitutionContext(nextPath);
  if (!roleHasInstitutionPermission(context.role, permission)) {
    redirect(`/owner/unauthorized?required=${encodeURIComponent(permission)}`);
  }
  return context;
}

export async function requireInstitutionPermission(permission: InstitutionPermission, ownerProfileId?: string) {
  const context = await getInstitutionPermissionContext(ownerProfileId);
  if (!context || !roleHasInstitutionPermission(context.role, permission)) {
    throw new Error("You do not have permission to perform this Examsim operation.");
  }
  return context;
}
