import { getAdminClient, getJwt } from "./supabase.ts";

export type InstitutionPermission =
  | "assessment_authoring"
  | "session_publishing"
  | "marking"
  | "moderation"
  | "invigilation"
  | "exports"
  | "analytics"
  | "student_data"
  | "student_management"
  | "readiness_security";

const ROLE_PERMISSIONS: Record<string, readonly InstitutionPermission[]> = {
  owner_admin: ["assessment_authoring", "session_publishing", "marking", "moderation", "invigilation", "exports", "analytics", "student_data", "student_management", "readiness_security"],
  teacher: ["assessment_authoring", "session_publishing", "marking", "moderation", "invigilation", "exports", "analytics", "student_data", "student_management"],
  marker: ["marking", "student_data"],
  reviewer: ["marking", "moderation", "analytics", "student_data"],
  invigilator: ["invigilation", "student_data"],
  read_only: ["analytics", "student_data"],
};

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

export async function requireInstitutionAal2(request: Request, permission: InstitutionPermission) {
  const auth = await requireUser(request);
  const payload = getJwtPayload(auth.jwt);
  if (payload.aal !== "aal2") throw new Error("MFA/AAL2 required for this action");
  const profile = await profileForAuthUser(auth.user.id);
  if (profile.app_role === "owner") {
    return { ...auth, profile, ownerProfileId: profile.id as string, institutionRole: "owner_admin" as const };
  }
  const { data: memberships, error } = await auth.admin
    .from("institution_memberships")
    .select("owner_profile_id,role,status")
    .eq("member_profile_id", profile.id)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(2);
  if (error) throw error;
  const permitted = (memberships ?? []).filter((membership) => ROLE_PERMISSIONS[String(membership.role)]?.includes(permission));
  if (permitted.length === 0) throw new Error("Institution permission required");
  if (permitted.length > 1) throw new Error("Multiple institution contexts found; select a workspace before this operation");
  return {
    ...auth,
    profile,
    ownerProfileId: String(permitted[0].owner_profile_id),
    institutionRole: String(permitted[0].role),
  };
}

export function assertInstitutionOwner(actualOwnerProfileId: string | null | undefined, expectedOwnerProfileId: string) {
  if (!actualOwnerProfileId || actualOwnerProfileId !== expectedOwnerProfileId) throw new Error("Resource is outside this institution");
}

export async function requireMarkerAssignment(
  admin: ReturnType<typeof getAdminClient>,
  context: { profile: { id: string }; institutionRole: string; ownerProfileId: string },
  attemptId: string,
) {
  if (context.institutionRole !== "marker") return;
  const { data, error } = await admin
    .from("marker_assignments")
    .select("id")
    .eq("owner_profile_id", context.ownerProfileId)
    .eq("marker_profile_id", context.profile.id)
    .eq("attempt_id", attemptId)
    .in("status", ["assigned", "in_progress"])
    .limit(1);
  if (error) throw error;
  if (!data?.length) throw new Error("Marker assignment required for this attempt");
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
