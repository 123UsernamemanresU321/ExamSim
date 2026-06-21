import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, requireInstitutionAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

type Body = {
  action: "upsert" | "delete" | "use";
  id?: string;
  label?: string;
  comment_text?: string;
  category?: string | null;
  subject?: string | null;
  tags?: string[];
  is_student_facing_default?: boolean;
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin, ownerProfileId } = await requireInstitutionAal2(request, "marking");
    const body = await readJson<Body>(request);

    if (body.action === "delete") {
      if (!body.id) return json({ error: "id is required" }, 400);
      const { error } = await admin.from("comment_bank_items").delete().eq("id", body.id).eq("owner_profile_id", ownerProfileId);
      if (error) throw error;
      await auditOwnerAction(ownerProfileId, user.id, "comment_bank.deleted", "comment_bank_items", body.id);
      return json({ ok: true });
    }

    if (body.action === "use") {
      if (!body.id) return json({ error: "id is required" }, 400);
      const { data: current, error: currentError } = await admin
        .from("comment_bank_items")
        .select("*")
        .eq("id", body.id)
        .eq("owner_profile_id", ownerProfileId)
        .single();
      if (currentError) throw currentError;
      const { data, error } = await admin
        .from("comment_bank_items")
        .update({ usage_count: Number(current.usage_count ?? 0) + 1, updated_at: new Date().toISOString() })
        .eq("id", body.id)
        .eq("owner_profile_id", ownerProfileId)
        .select("*")
        .single();
      if (error) throw error;
      await auditOwnerAction(ownerProfileId, user.id, "comment_bank.used", "comment_bank_items", body.id);
      return json({ ok: true, item: data });
    }

    if (!body.label?.trim() || !body.comment_text?.trim()) return json({ error: "label and comment_text are required" }, 400);
    const payload = {
      owner_profile_id: ownerProfileId,
      label: body.label.trim(),
      comment_text: body.comment_text.trim(),
      category: body.category?.trim() || null,
      subject: body.subject?.trim() || null,
      tags: Array.isArray(body.tags) ? body.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
      is_student_facing_default: body.is_student_facing_default ?? true,
      updated_at: new Date().toISOString(),
    };
    const query = body.id
      ? admin.from("comment_bank_items").update(payload).eq("id", body.id).eq("owner_profile_id", ownerProfileId)
      : admin.from("comment_bank_items").insert(payload);
    const { data, error } = await query.select("*").single();
    if (error) throw error;
    await auditOwnerAction(ownerProfileId, user.id, body.id ? "comment_bank.updated" : "comment_bank.created", "comment_bank_items", data.id);
    return json({ ok: true, item: data });
  } catch (error) {
    return errorResponse(error, "comment-bank failed");
  }
});
