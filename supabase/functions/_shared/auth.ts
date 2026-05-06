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

export function getJwtPayload(jwt: string): Record<string, unknown> {
  const [, payload] = jwt.split(".");
  if (!payload) return {};
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function requireOwnerAal2(request: Request) {
  const auth = await requireOwner(request);
  const payload = getJwtPayload(auth.jwt);
  if (payload.aal !== "aal2") {
    throw new Error("Owner MFA/AAL2 required for this action");
  }
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

export async function auditOwnerAction(
  ownerProfileId: string,
  actorAuthUserId: string,
  action: string,
  targetTable?: string | null,
  targetId?: string | null,
  metadata?: Record<string, unknown>,
) {
  const admin = getAdminClient();
  await admin.from("owner_audit_logs").insert({
    owner_profile_id: ownerProfileId,
    actor_auth_user_id: actorAuthUserId,
    action,
    target_table: targetTable ?? null,
    target_id: targetId ?? null,
    metadata_json: metadata ?? {},
  });
}
