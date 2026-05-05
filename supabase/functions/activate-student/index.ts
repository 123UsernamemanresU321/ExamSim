import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";
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
      return json({ error: "Missing activation fields" }, 400);
    }
    if (body.new_password.length < 10) return json({ error: "Password must be at least 10 characters" }, 400);

    const admin = getAdminClient();
    const { data: credential, error } = await admin
      .from("student_credentials")
      .select("*, profiles(auth_user_id)")
      .eq("login_code", body.login_code)
      .maybeSingle();
    if (error) throw error;
    if (!credential || credential.activated_at) return json({ error: "Invalid or already activated code" }, 400);

    const hash = await sha256Hex(body.activation_code);
    if (hash !== credential.activation_code_hash) return json({ error: "Invalid activation code" }, 400);

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

    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "activate-student failed" }, 400);
  }
});
