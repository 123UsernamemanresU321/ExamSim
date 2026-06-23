import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { verifyGuestAttemptToken } from "../_shared/examsim-guest.ts";
import { sha256Hex } from "../_shared/hash.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { getAdminClient } from "../_shared/supabase.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const body = await readJson<{ guest_token?: string; attempt_id?: string; device_id?: string }>(request);
    const { attempt } = await verifyGuestAttemptToken(request, body);
    const admin = getAdminClient();
    await enforceRateLimit(admin, {
      scope: "guest-attempt-session:attempt",
      key: String(attempt.id),
      limit: 20,
      windowSeconds: 3600,
    });
    const deviceIdHash = body.device_id ? await sha256Hex(body.device_id) : null;
    const userAgentHash = await sha256Hex(request.headers.get("user-agent") ?? "");
    const ipHash = await sha256Hex(request.headers.get("x-forwarded-for") ?? "");
    let activeSessionQuery = admin.from("attempt_sessions")
      .select("id")
      .eq("attempt_id", attempt.id)
      .is("ended_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    activeSessionQuery = deviceIdHash
      ? activeSessionQuery.eq("device_id_hash", deviceIdHash)
      : activeSessionQuery.eq("user_agent_hash", userAgentHash).eq("ip_hash", ipHash);
    const { data: activeSessions, error: activeSessionError } = await activeSessionQuery;
    if (activeSessionError) throw activeSessionError;
    if (activeSessions?.[0]?.id) {
      return json(request, { attempt_session_id: activeSessions[0].id, idempotent: true });
    }
    const { data: session, error } = await admin.from("attempt_sessions").insert({
      attempt_id: attempt.id,
      device_id_hash: deviceIdHash,
      user_agent_hash: userAgentHash,
      ip_hash: ipHash,
      last_heartbeat_at: new Date().toISOString(),
    }).select("id").single();
    if (error) throw error;
    return json(request, { attempt_session_id: session.id });
  } catch (error) {
    return errorResponse(request, error, "guest-start-attempt-session failed");
  }
});
