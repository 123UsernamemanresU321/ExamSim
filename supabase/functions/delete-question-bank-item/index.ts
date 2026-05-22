import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

type Body = {
  question_bank_item_id: string;
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireOwnerAal2(request);
    const ownerProfile = await profileForAuthUser(user.id);
    const body = await readJson<Body>(request);
    if (!body.question_bank_item_id) return json({ error: "question_bank_item_id is required" }, 400);

    const { data: item, error: itemError } = await admin
      .from("question_bank_items")
      .select("id, title, root_node_key, source_assessment_id, source_assessment_version_id, source_question_node_id, owner_profile_id")
      .eq("id", body.question_bank_item_id)
      .eq("owner_profile_id", ownerProfile.id)
      .single();
    if (itemError) throw itemError;

    const { data: generatedRefs, error: generatedRefsError } = await admin
      .from("generated_paper_items")
      .select("id, generated_paper_id")
      .eq("question_bank_item_id", item.id);
    if (generatedRefsError) throw generatedRefsError;

    const { data: children, error: childListError } = await admin
      .from("question_bank_children")
      .select("id")
      .eq("question_bank_item_id", item.id);
    if (childListError) throw childListError;

    if ((generatedRefs ?? []).length) {
      const { error } = await admin
        .from("generated_paper_items")
        .delete()
        .eq("question_bank_item_id", item.id);
      if (error) throw error;
    }

    const { error: childDeleteError } = await admin
      .from("question_bank_children")
      .delete()
      .eq("question_bank_item_id", item.id);
    if (childDeleteError) throw childDeleteError;

    await auditOwnerAction(ownerProfile.id, user.id, "question_bank_item.deleted", "question_bank_items", item.id, {
      title: item.title,
      root_node_key: item.root_node_key,
      source_assessment_id: item.source_assessment_id,
      source_assessment_version_id: item.source_assessment_version_id,
      source_question_node_id: item.source_question_node_id,
      child_count: children?.length ?? 0,
      generated_paper_reference_count: generatedRefs?.length ?? 0,
    });

    const { error: deleteError } = await admin
      .from("question_bank_items")
      .delete()
      .eq("id", item.id)
      .eq("owner_profile_id", ownerProfile.id);
    if (deleteError) throw deleteError;

    return json({
      ok: true,
      deleted_question_bank_item_id: item.id,
      removed_child_count: children?.length ?? 0,
      removed_generated_paper_references: generatedRefs?.length ?? 0,
    });
  } catch (error) {
    return errorResponse(error, "delete-question-bank-item failed");
  }
});
