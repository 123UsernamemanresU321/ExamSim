import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

type Body =
  | { action: "create_document"; assessment_id: string; assessment_version_id: string; source_object_path: string }
  | { action: "upsert_node"; markscheme_document_id: string; node_key?: string | null; mapped_question_node_id?: string | null; markscheme_html?: string | null; source_page_start?: number | null; source_page_end?: number | null; confidence?: number | null; status?: string }
  | { action: "map_node"; markscheme_node_id: string; question_node_id: string }
  | { action: "ignore_node"; markscheme_node_id: string };

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireOwnerAal2(request);
    const ownerProfile = await profileForAuthUser(user.id);
    const body = await readJson<Body>(request);

    if (body.action === "create_document") {
      const { data: assessment, error: assessmentError } = await admin.from("assessments").select("owner_profile_id").eq("id", body.assessment_id).single();
      if (assessmentError) throw assessmentError;
      if (assessment.owner_profile_id !== ownerProfile.id) return json({ error: "Forbidden" }, 403);
      const { data, error } = await admin
        .from("markscheme_documents")
        .insert({
          assessment_id: body.assessment_id,
          assessment_version_id: body.assessment_version_id,
          source_object_path: body.source_object_path,
          status: "review_required",
        })
        .select("*")
        .single();
      if (error) throw error;
      await auditOwnerAction(ownerProfile.id, user.id, "markscheme_document.created", "markscheme_documents", data.id);
      return json({ ok: true, document: data });
    }

    if (body.action === "upsert_node") {
      const normalized = normalizeNodeKey(body.node_key ?? null);
      const { data, error } = await admin
        .from("markscheme_nodes")
        .insert({
          markscheme_document_id: body.markscheme_document_id,
          node_key: body.node_key ?? null,
          normalized_key: normalized,
          ordinal_path: ordinalPathForKey(body.node_key ?? null),
          mapped_question_node_id: body.mapped_question_node_id ?? null,
          markscheme_html: body.markscheme_html ?? null,
          source_page_start: body.source_page_start ?? null,
          source_page_end: body.source_page_end ?? null,
          confidence: body.confidence ?? null,
          status: body.status ?? (body.mapped_question_node_id ? "mapped" : "needs_review"),
        })
        .select("*")
        .single();
      if (error) throw error;
      await auditOwnerAction(ownerProfile.id, user.id, "markscheme_node.created", "markscheme_nodes", data.id);
      return json({ ok: true, node: data });
    }

    const status = body.action === "map_node" ? "mapped" : "ignored";
    const { data, error } = await admin
      .from("markscheme_nodes")
      .update({
        status,
        mapped_question_node_id: body.action === "map_node" ? body.question_node_id : null,
      })
      .eq("id", body.markscheme_node_id)
      .select("*")
      .single();
    if (error) throw error;
    await auditOwnerAction(ownerProfile.id, user.id, `markscheme_node.${status}`, "markscheme_nodes", body.markscheme_node_id);
    return json({ ok: true, node: data });
  } catch (error) {
    return errorResponse(error, "markscheme-mapper failed");
  }
});

function normalizeNodeKey(rawKey: string | null) {
  const path = ordinalPathForKey(rawKey);
  if (!path?.length) return null;
  if (path.length === 1) return `Q${path[0]}`;
  return `${path[0]}${path.slice(1).map((part, index) => `(${partLabel(part, index + 1)})`).join("")}`;
}

function ordinalPathForKey(rawKey: string | null) {
  if (!rawKey) return null;
  const key = rawKey.trim().replace(/\s+/g, "").replace(/[.:]+$/g, "").replace(/^(question|problem|q)(\d+)/i, "$2").replace(/^q(?=\d)/i, "").replace(/^(\d+)[.)]?([a-z])$/i, "$1($2)").toLowerCase();
  const root = key.match(/^(\d+)/);
  if (!root) return null;
  const path = [Number(root[1])];
  for (const match of key.matchAll(/\(([^()]+)\)/g)) path.push(partOrdinal(match[1] ?? "", path.length));
  return path;
}

function partOrdinal(raw: string, depth: number) {
  const token = raw.toLowerCase();
  if (/^\d+$/.test(token)) return Number(token);
  if (/^[ivxlcdm]+$/.test(token) && depth >= 2) return romanToNumber(token);
  if (/^[a-z]+$/.test(token)) return token.split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 96, 0);
  return 9999;
}

function partLabel(value: number, depth: number) {
  if (depth === 1) return String.fromCharCode(96 + value);
  if (depth === 2) return numberToRoman(value);
  if (depth === 3) return String.fromCharCode(64 + value);
  return String(value);
}

function romanToNumber(raw: string) {
  const values: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
  return raw.split("").reduce((total, char, index, chars) => {
    const current = values[char] ?? 0;
    const next = values[chars[index + 1]] ?? 0;
    return total + (current < next ? -current : current);
  }, 0);
}

function numberToRoman(value: number) {
  const pairs: Array<[number, string]> = [[10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let out = "";
  let remaining = value;
  for (const [amount, label] of pairs) {
    while (remaining >= amount) {
      out += label;
      remaining -= amount;
    }
  }
  return out || "i";
}
