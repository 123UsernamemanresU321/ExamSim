import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { randomCode, sha256Hex } from "../_shared/hash.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireOwnerAal2(request);
    const body = await readJson<{ display_name: string; student_13_plus_attested?: boolean }>(request);
    if (!body.display_name?.trim()) return json({ error: "display_name is required" }, 400);
    if (!body.student_13_plus_attested) return json({ error: "13+ student attestation is required" }, 400);

    const ownerProfile = await profileForAuthUser(user.id);
    const loginCode = randomCode("STU");
    const activationCode = randomCode("ACT", 8);
    const email = `${loginCode.toLowerCase()}@students.local.exam-vault`;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { app_role: "student" },
      user_metadata: { display_name: body.display_name },
    });
    if (createError || !created.user) throw createError ?? new Error("Could not create auth user");

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .insert({
        auth_user_id: created.user.id,
        app_role: "student",
        display_name: body.display_name.trim(),
        owner_profile_id: ownerProfile.id,
        student_13_plus_attested_at: new Date().toISOString(),
        student_13_plus_attested_by_profile_id: ownerProfile.id,
      })
      .select("*")
      .single();
    if (profileError) throw profileError;

    const hash = await sha256Hex(activationCode);
    const { error: credentialError } = await admin.from("student_credentials").insert({
      student_profile_id: profile.id,
      login_code: loginCode,
      activation_code_hash: hash,
    });
    if (credentialError) throw credentialError;

    const { error: linkError } = await admin.from("owner_student_links").insert({
      owner_profile_id: ownerProfile.id,
      student_profile_id: profile.id,
      link_type: "managed_student",
    });
    if (linkError) throw linkError;

    await auditOwnerAction(ownerProfile.id, user.id, "student.created", "profiles", profile.id, {
      student_13_plus_attested: true,
    });

    return json({ login_code: loginCode, activation_code: activationCode });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "create-student failed" }, 401);
  }
});
