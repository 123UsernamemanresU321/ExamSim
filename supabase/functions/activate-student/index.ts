import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import { enforceRateLimit, normalizeRateLimitKey, requestIpKey } from "../_shared/rate-limit.ts";
import { getAdminClient } from "../_shared/supabase.ts";
import { sha256Hex } from "../_shared/hash.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const body = await readJson<{
      login_code: string;
      activation_code: string;
      new_password: string;
    }>(request);
    if (!body.login_code || !body.activation_code || !body.new_password) {
      return json(request, { error: "Missing activation fields" }, 400);
    }
    if (body.new_password.length < 10) return json(request, { error: "Password must be at least 10 characters" }, 400);

    const admin = getAdminClient();
    const normalizedLoginCode = normalizeRateLimitKey(body.login_code);
    await enforceRateLimit(admin, {
      scope: "activate-student:ip",
      key: requestIpKey(request),
      limit: 30,
      windowSeconds: 3600,
    });
    await enforceRateLimit(admin, {
      scope: "activate-student:login-code",
      key: normalizedLoginCode,
      limit: 8,
      windowSeconds: 3600,
    });

    const { data: credential, error } = await admin
      .from("student_credentials")
      .select("*, profiles(auth_user_id)")
      .eq("login_code", body.login_code.trim())
      .maybeSingle();
    if (error) throw error;
    if (!credential || credential.activated_at) return json(request, { error: "Invalid or expired activation details" }, 400);

    const hash = await sha256Hex(body.activation_code);
    if (hash !== credential.activation_code_hash) return json(request, { error: "Invalid or expired activation details" }, 400);

    const authUserId = credential.profiles?.auth_user_id;
    if (!authUserId) throw new Error("Student auth user not found");

    const { error: updateUserError } = await admin.auth.admin.updateUserById(authUserId, {
      password: body.new_password,
      app_metadata: { app_role: "student" },
    });
    if (updateUserError) throw updateUserError;

    const { error: updateCredentialError } = await admin
      .from("student_credentials")
      .update({ activated_at: new Date().toISOString() })
      .eq("id", credential.id);
    if (updateCredentialError) throw updateCredentialError;

    return json(request, { ok: true });
  } catch (error) {
    return errorResponse(request, error, "activate-student failed");
  }
});
