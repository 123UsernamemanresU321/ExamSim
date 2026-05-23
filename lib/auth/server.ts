import { redirect } from "next/navigation";
import type { AppRole } from "@/lib/constants";
import { isDemoModeEnabled } from "@/lib/runtime";
import { dashboardPathForRole } from "@/lib/auth/routing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type GuardedProfile = {
  id: string;
  app_role: AppRole;
  display_name: string;
  auth_user_id?: string;
  email?: string | null;
};

export type CurrentUserProfile = {
  user: {
    id: string;
    email: string | null;
  } | null;
  profile: GuardedProfile | null;
};

export async function getCurrentUserProfile(): Promise<CurrentUserProfile> {
  if (isDemoModeEnabled()) return { user: null, profile: null };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return { user: null, profile: null };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, auth_user_id, app_role, display_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return { user: { id: user.id, email: user.email ?? null }, profile: null };
  }

  return {
    user: { id: user.id, email: user.email ?? null },
    profile: {
      id: profile.id,
      auth_user_id: profile.auth_user_id,
      app_role: profile.app_role,
      display_name: profile.display_name,
      email: user.email ?? null,
    },
  };
}

export async function requireAppRole(allowedRole: AppRole, nextPath: string): Promise<GuardedProfile | null> {
  if (isDemoModeEnabled()) return null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, app_role, display_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    redirect("/login");
  }

  if (profile.app_role !== allowedRole) {
    redirect(dashboardPathForRole(profile.app_role));
  }

  return profile;
}
