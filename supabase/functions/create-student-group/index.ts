import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, requireInstitutionAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin, ownerProfileId } = await requireInstitutionAal2(request, "student_management");
    const body = await readJson<{ name: string; description?: string; student_profile_ids?: string[] }>(request);
    const name = body.name?.trim();
    if (!name) return json({ error: "Group name is required" }, 400);

    const { data: group, error: groupError } = await admin
      .from("student_groups")
      .insert({
        owner_profile_id: ownerProfileId,
        name,
        description: body.description?.trim() || null,
      })
      .select("*")
      .single();
    if (groupError) throw groupError;

    const memberIds = [...new Set(body.student_profile_ids ?? [])];
    if (memberIds.length > 0) {
      const { data: links, error: linkError } = await admin
        .from("owner_student_links")
        .select("student_profile_id")
        .eq("owner_profile_id", ownerProfileId)
        .in("student_profile_id", memberIds);
      if (linkError) throw linkError;
      const linkedIds = new Set((links ?? []).map((link) => link.student_profile_id));
      if (memberIds.some((studentId) => !linkedIds.has(studentId))) throw new Error("Group members must belong to this institution");
      const { error: memberError } = await admin.from("student_group_members").insert(
        memberIds.map((studentId) => ({
          group_id: group.id,
          student_profile_id: studentId,
        })),
      );
      if (memberError) throw memberError;
    }

    await auditOwnerAction(ownerProfileId, user.id, "student_group.created", "student_groups", group.id, {
      member_count: memberIds.length,
    });

    return json({ group_id: group.id, member_count: memberIds.length });
  } catch (error) {
    return errorResponse(error, "create-student-group failed");
  }
});
