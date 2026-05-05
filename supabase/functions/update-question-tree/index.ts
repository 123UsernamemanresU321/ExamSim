import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { requireOwner } from "../_shared/auth.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { admin } = await requireOwner(request);
    const body = await readJson<{ version_id: string; nodes: Record<string, unknown>[] }>(request);
    if (!body.version_id || !Array.isArray(body.nodes)) return json({ error: "version_id and nodes are required" }, 400);
    const { error: deleteError } = await admin.from("question_nodes").delete().eq("assessment_version_id", body.version_id);
    if (deleteError) throw deleteError;
    const rows = body.nodes.map((node, index) => ({
      assessment_version_id: body.version_id,
      node_key: String(node.node_key ?? index + 1),
      ordinal: Number(node.ordinal ?? index + 1),
      node_type: String(node.node_type ?? "question"),
      title: typeof node.title === "string" ? node.title : null,
      prompt_html: typeof node.prompt_html === "string" ? node.prompt_html : null,
      prompt_latex: typeof node.prompt_latex === "string" ? node.prompt_latex : null,
      marks: typeof node.marks === "number" ? node.marks : null,
      response_mode: String(node.response_mode ?? "typed_or_upload"),
      interaction_json: typeof node.interaction_json === "object" ? node.interaction_json : null,
    }));
    const { error: insertError } = await admin.from("question_nodes").insert(rows);
    if (insertError) throw insertError;
    const { error: versionError } = await admin
      .from("assessment_versions")
      .update({ requires_owner_review: false, status: "draft" })
      .eq("id", body.version_id);
    if (versionError) throw versionError;
    return json({ ok: true, node_count: rows.length });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "update-question-tree failed" }, 401);
  }
});
