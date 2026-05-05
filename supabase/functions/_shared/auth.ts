import { getAdminClient, getJwt } from "./supabase.ts";

export async function requireUser(request: Request) {
  const jwt = getJwt(request);
  if (!jwt) throw new Error("Missing bearer token");
  const admin = getAdminClient();
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) throw new Error("Invalid bearer token");
  return { jwt, user: data.user, admin };
}

export async function requireOwner(request: Request) {
  const auth = await requireUser(request);
  const ownerEmail = Deno.env.get("OWNER_EMAIL")?.toLowerCase();
  const isOwnerRole = auth.user.app_metadata?.app_role === "owner";
  const isOwnerEmail = ownerEmail && auth.user.email?.toLowerCase() === ownerEmail;
  if (!isOwnerRole && !isOwnerEmail) throw new Error("Owner role required");
  return auth;
}

export async function profileForAuthUser(authUserId: string) {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Profile not found");
  return data;
}
