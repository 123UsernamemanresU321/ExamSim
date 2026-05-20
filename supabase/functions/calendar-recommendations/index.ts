import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

type Body =
  | { action: "generate_for_attempt"; attempt_id: string; threshold?: number }
  | { action: "set_status"; recommendation_id: string; status: "accepted" | "dismissed" | "exported" };

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireOwnerAal2(request);
    const ownerProfile = await profileForAuthUser(user.id);
    const body = await readJson<Body>(request);

    if (body.action === "set_status") {
      const { data, error } = await admin
        .from("calendar_recommendations")
        .update({ status: body.status })
        .eq("id", body.recommendation_id)
        .eq("owner_profile_id", ownerProfile.id)
        .select("*")
        .single();
      if (error) throw error;
      await auditOwnerAction(ownerProfile.id, user.id, "calendar_recommendation.status_changed", "calendar_recommendations", body.recommendation_id, { status: body.status });
      return json({ ok: true, recommendation: data });
    }

    const { data: attempt, error: attemptError } = await admin
      .from("attempts")
      .select("id, assessment_id, assessment_version_id, assignee_profile_id, assessments(owner_profile_id, paper_code)")
      .eq("id", body.attempt_id)
      .single();
    if (attemptError) throw attemptError;
    const assessment = Array.isArray(attempt.assessments) ? attempt.assessments[0] : attempt.assessments;
    if (assessment?.owner_profile_id !== ownerProfile.id) return json({ error: "Forbidden" }, 403);

    const [{ data: nodes }, { data: marks }, { data: links }, { data: tags }] = await Promise.all([
      admin.from("question_nodes").select("id, marks").eq("assessment_version_id", attempt.assessment_version_id),
      admin.from("marks").select("question_node_id, awarded_marks").eq("attempt_id", body.attempt_id),
      admin.from("question_topic_links").select("question_node_id, topic_tag_id, weight"),
      admin.from("topic_tags").select("id, subject, tag").eq("owner_profile_id", ownerProfile.id),
    ]);

    const nodeById = new Map((nodes ?? []).map((node: { id: string; marks: number | null }) => [node.id, node]));
    const markByNodeId = new Map((marks ?? []).filter((mark: { question_node_id: string | null }) => mark.question_node_id).map((mark: { question_node_id: string; awarded_marks: number }) => [mark.question_node_id, Number(mark.awarded_marks)]));
    const tagById = new Map((tags ?? []).map((tag: { id: string; subject: string; tag: string }) => [tag.id, tag]));
    const aggregate = new Map<string, { awarded: number; available: number }>();
    for (const link of links ?? []) {
      const node = nodeById.get(link.question_node_id);
      if (!node) continue;
      const available = Number(node.marks ?? 0) * Number(link.weight ?? 1);
      if (available <= 0) continue;
      const current = aggregate.get(link.topic_tag_id) ?? { awarded: 0, available: 0 };
      current.available += available;
      current.awarded += Number(markByNodeId.get(node.id) ?? 0) * Number(link.weight ?? 1);
      aggregate.set(link.topic_tag_id, current);
    }
    const threshold = body.threshold ?? 0.6;
    const rows = [...aggregate.entries()].filter(([, total]) => total.available > 0 && total.awarded / total.available < threshold).map(([topicTagId, total]) => {
      const tag = tagById.get(topicTagId);
      const percent = Math.round((total.awarded / total.available) * 100);
      return {
        owner_profile_id: ownerProfile.id,
        student_profile_id: attempt.assignee_profile_id,
        assessment_id: attempt.assessment_id,
        paper_code: assessment?.paper_code ?? null,
        topic_tag_id: topicTagId,
        reason: `Review ${tag ? `${tag.subject}: ${tag.tag}` : "this topic"} (${percent}% on tagged marks).`,
        priority: percent < 35 ? "high" : percent < 50 ? "medium" : "low",
        suggested_minutes: percent < 35 ? 60 : 45,
        status: "pending",
      };
    });
    const { data, error } = rows.length ? await admin.from("calendar_recommendations").insert(rows).select("*") : { data: [], error: null };
    if (error) throw error;
    await auditOwnerAction(ownerProfile.id, user.id, "calendar_recommendations.generated", "attempts", body.attempt_id, { count: rows.length });
    return json({ ok: true, recommendations: data ?? [] });
  } catch (error) {
    return errorResponse(error, "calendar-recommendations failed");
  }
});
