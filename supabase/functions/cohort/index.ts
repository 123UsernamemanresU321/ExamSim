import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

type Body =
  | { action: "upsert"; id?: string; name: string; description?: string | null; student_profile_ids?: string[] }
  | { action: "delete"; id: string }
  | { action: "set_members"; cohort_id: string; student_profile_ids: string[] };

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireOwnerAal2(request);
    const ownerProfile = await profileForAuthUser(user.id);
    const body = await readJson<Body>(request);

    if (body.action === "delete") {
      const { error } = await admin.from("cohorts").delete().eq("id", body.id).eq("owner_profile_id", ownerProfile.id);
      if (error) throw error;
      await auditOwnerAction(ownerProfile.id, user.id, "cohort.deleted", "cohorts", body.id);
      return json({ ok: true });
    }

    if (body.action === "set_members") {
      const { data: cohort, error: cohortError } = await admin.from("cohorts").select("owner_profile_id").eq("id", body.cohort_id).single();
      if (cohortError) throw cohortError;
      if (cohort.owner_profile_id !== ownerProfile.id) return json({ error: "Forbidden" }, 403);
      await replaceMembers(admin, body.cohort_id, body.student_profile_ids);
      await auditOwnerAction(ownerProfile.id, user.id, "cohort.members_updated", "cohorts", body.cohort_id, { count: body.student_profile_ids.length });
      return json({ ok: true });
    }

    if (!body.name?.trim()) return json({ error: "name is required" }, 400);
    const query = body.id
      ? admin.from("cohorts").update({ name: body.name.trim(), description: body.description?.trim() || null, updated_at: new Date().toISOString() }).eq("id", body.id).eq("owner_profile_id", ownerProfile.id)
      : admin.from("cohorts").insert({ owner_profile_id: ownerProfile.id, name: body.name.trim(), description: body.description?.trim() || null });
    const { data, error } = await query.select("*").single();
    if (error) throw error;
    if (Array.isArray(body.student_profile_ids)) await replaceMembers(admin, data.id, body.student_profile_ids);
    await auditOwnerAction(ownerProfile.id, user.id, body.id ? "cohort.updated" : "cohort.created", "cohorts", data.id);
    return json({ ok: true, cohort: data });
  } catch (error) {
    return errorResponse(error, "cohort failed");
  }
});

async function replaceMembers(admin: any, cohortId: string, studentIds: string[]) {
  await admin.from("cohort_members").delete().eq("cohort_id", cohortId);
  const rows = [...new Set(studentIds)].map((student_profile_id) => ({ cohort_id: cohortId, student_profile_id }));
  if (rows.length) {
    const { error } = await admin.from("cohort_members").insert(rows);
    if (error) throw error;
  }
}
