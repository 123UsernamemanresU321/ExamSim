import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

type Body =
  | { action: "upsert_tag"; id?: string; subject: string; tag: string; parent_tag_id?: string | null }
  | { action: "link_question"; question_node_id: string; topic_tag_id: string; weight?: number }
  | { action: "unlink_question"; question_node_id: string; topic_tag_id: string };

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireOwnerAal2(request);
    const ownerProfile = await profileForAuthUser(user.id);
    const body = await readJson<Body>(request);

    if (body.action === "upsert_tag") {
      if (!body.subject?.trim() || !body.tag?.trim()) return json({ error: "subject and tag are required" }, 400);
      const payload = { owner_profile_id: ownerProfile.id, subject: body.subject.trim(), tag: body.tag.trim(), parent_tag_id: body.parent_tag_id ?? null };
      const query = body.id
        ? admin.from("topic_tags").update(payload).eq("id", body.id).eq("owner_profile_id", ownerProfile.id)
        : admin.from("topic_tags").upsert(payload, { onConflict: "owner_profile_id,subject,tag" });
      const { data, error } = await query.select("*").single();
      if (error) throw error;
      await auditOwnerAction(ownerProfile.id, user.id, "topic_tag.upserted", "topic_tags", data.id);
      return json({ ok: true, tag: data });
    }

    if (body.action === "link_question") {
      const { data, error } = await admin
        .from("question_topic_links")
        .upsert({
          question_node_id: body.question_node_id,
          topic_tag_id: body.topic_tag_id,
          weight: Math.max(0.1, Number(body.weight ?? 1)),
        }, { onConflict: "question_node_id,topic_tag_id" })
        .select("*")
        .single();
      if (error) throw error;
      await auditOwnerAction(ownerProfile.id, user.id, "question_topic.linked", "question_topic_links", data.id);
      return json({ ok: true, link: data });
    }

    const { error } = await admin
      .from("question_topic_links")
      .delete()
      .eq("question_node_id", body.question_node_id)
      .eq("topic_tag_id", body.topic_tag_id);
    if (error) throw error;
    await auditOwnerAction(ownerProfile.id, user.id, "question_topic.unlinked", "question_topic_links", body.question_node_id, { topic_tag_id: body.topic_tag_id });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error, "topic-tags failed");
  }
});
