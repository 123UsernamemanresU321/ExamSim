import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireOwnerAal2(request);
    const ownerProfile = await profileForAuthUser(user.id);
    const body = await readJson<{ name: string; description?: string; student_profile_ids?: string[] }>(request);
    const name = body.name?.trim();
    if (!name) return json({ error: "Group name is required" }, 400);

    const { data: group, error: groupError } = await admin
      .from("student_groups")
      .insert({
        owner_profile_id: ownerProfile.id,
        name,
        description: body.description?.trim() || null,
      })
      .select("*")
      .single();
    if (groupError) throw groupError;

    const memberIds = [...new Set(body.student_profile_ids ?? [])];
    if (memberIds.length > 0) {
      const { error: memberError } = await admin.from("student_group_members").insert(
        memberIds.map((studentId) => ({
          group_id: group.id,
          student_profile_id: studentId,
        })),
      );
      if (memberError) throw memberError;
    }

    await auditOwnerAction(ownerProfile.id, user.id, "student_group.created", "student_groups", group.id, {
      member_count: memberIds.length,
    });

    return json({ group_id: group.id, member_count: memberIds.length });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "create-student-group failed" }, 401);
  }
});
