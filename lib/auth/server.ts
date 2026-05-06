import { redirect } from "next/navigation";
import type { AppRole } from "@/lib/constants";
import { isDemoModeEnabled } from "@/lib/runtime";
import { dashboardPathForRole } from "@/lib/auth/routing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type GuardedProfile = {
  id: string;
  app_role: AppRole;
  display_name: string;
};

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
