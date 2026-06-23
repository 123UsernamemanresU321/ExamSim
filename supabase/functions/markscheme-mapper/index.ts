import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertInstitutionOwner, auditOwnerAction, requireInstitutionAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import { assertVersionMutable } from "../_shared/version-governance.ts";

type Body =
  | { action: "create_document"; assessment_id: string; assessment_version_id: string; source_object_path: string }
  | { action: "bootstrap_document"; markscheme_document_id: string }
  | { action: "approve_document_mappings"; markscheme_document_id: string }
  | { action: "upsert_node"; markscheme_document_id: string; node_key?: string | null; mapped_question_node_id?: string | null; markscheme_html?: string | null; source_page_start?: number | null; source_page_end?: number | null; confidence?: number | null; status?: string }
  | { action: "map_node"; markscheme_node_id: string; question_node_id: string }
  | { action: "ignore_node"; markscheme_node_id: string };

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin, ownerProfileId } = await requireInstitutionAal2(request, "assessment_authoring");
    const body = await readJson<Body>(request);

    if (body.action === "create_document") {
      const { data: assessment, error: assessmentError } = await admin.from("assessments").select("owner_profile_id").eq("id", body.assessment_id).single();
      if (assessmentError) throw assessmentError;
      assertInstitutionOwner(assessment.owner_profile_id, ownerProfileId);
      const { data: version, error: versionError } = await admin
        .from("assessment_versions")
        .select("id,status,markscheme_source_object_path,markscheme_pdf_path")
        .eq("id", body.assessment_version_id)
        .eq("assessment_id", body.assessment_id)
        .single();
      if (versionError) throw versionError;
      if (!version) throw new Error("Assessment version not found");
      assertVersionMutable(version.status);
      if (![version.markscheme_source_object_path, version.markscheme_pdf_path].filter(Boolean).includes(body.source_object_path)) {
        return json({ error: "The markscheme source path does not belong to this assessment version" }, 403);
      }
      const { data: existingDocument, error: existingDocumentError } = await admin
        .from("markscheme_documents")
        .select("*")
        .eq("assessment_version_id", body.assessment_version_id)
        .eq("source_object_path", body.source_object_path)
        .maybeSingle();
      if (existingDocumentError) throw existingDocumentError;
      if (existingDocument) return json({ ok: true, document: existingDocument, existing: true });
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
      await auditOwnerAction(ownerProfileId, user.id, "markscheme_document.created", "markscheme_documents", data.id);
      return json({ ok: true, document: data });
    }

    if (body.action === "bootstrap_document") {
      const document = await loadOwnedMarkschemeDocument(admin, ownerProfileId, body.markscheme_document_id);
      const { data: questions, error: questionError } = await admin
        .from("question_nodes")
        .select("id,node_key,markscheme_html,source_page_start,source_page_end")
        .eq("assessment_version_id", document.assessment_version_id)
        .order("ordinal_path");
      if (questionError) throw questionError;
      const { data: existingNodes, error: existingNodeError } = await admin
        .from("markscheme_nodes")
        .select("mapped_question_node_id,node_key")
        .eq("markscheme_document_id", body.markscheme_document_id);
      if (existingNodeError) throw existingNodeError;
      const existingQuestionIds = new Set((existingNodes ?? []).map((node) => node.mapped_question_node_id).filter(Boolean));
      const rows = (questions ?? [])
        .filter((question) => typeof question.markscheme_html === "string" && question.markscheme_html.trim() && !existingQuestionIds.has(question.id))
        .map((question) => ({
          markscheme_document_id: body.markscheme_document_id,
          node_key: question.node_key,
          normalized_key: normalizeNodeKey(question.node_key),
          ordinal_path: ordinalPathForKey(question.node_key),
          mapped_question_node_id: question.id,
          markscheme_html: question.markscheme_html,
          source_page_start: question.source_page_start,
          source_page_end: question.source_page_end,
          confidence: 1,
          status: "needs_review",
        }));
      if (rows.length) {
        const { error: insertError } = await admin.from("markscheme_nodes").insert(rows);
        if (insertError) throw insertError;
      }
      await admin.from("markscheme_documents").update({ status: "review_required" }).eq("id", body.markscheme_document_id);
      await auditOwnerAction(ownerProfileId, user.id, "markscheme_mapping.bootstrap", "markscheme_documents", body.markscheme_document_id, {
        created_count: rows.length,
      });
      return json({ ok: true, created_count: rows.length });
    }

    if (body.action === "approve_document_mappings") {
      const document = await loadOwnedMarkschemeDocument(admin, ownerProfileId, body.markscheme_document_id);
      const { data: nodes, error: nodeError } = await admin
        .from("markscheme_nodes")
        .select("id,status,mapped_question_node_id")
        .eq("markscheme_document_id", body.markscheme_document_id);
      if (nodeError) throw nodeError;
      const activeNodes = (nodes ?? []).filter((node) => node.status !== "ignored");
      if (!activeNodes.length) return json({ error: "Create at least one markscheme mapping before approval" }, 400);
      if (activeNodes.some((node) => !node.mapped_question_node_id)) {
        return json({ error: "Every active markscheme section must be mapped or ignored before approval" }, 409);
      }
      await assertMappedQuestionsInVersion(
        admin,
        activeNodes.map((node) => node.mapped_question_node_id as string),
        document.assessment_version_id,
      );
      const { error: mappingError } = await admin
        .from("markscheme_nodes")
        .update({ status: "mapped" })
        .eq("markscheme_document_id", body.markscheme_document_id)
        .neq("status", "ignored");
      if (mappingError) throw mappingError;
      const { error: documentError } = await admin
        .from("markscheme_documents")
        .update({ status: "approved" })
        .eq("id", body.markscheme_document_id);
      if (documentError) throw documentError;
      await auditOwnerAction(ownerProfileId, user.id, "markscheme_mapping.approved", "markscheme_documents", body.markscheme_document_id, {
        mapping_count: activeNodes.length,
      });
      return json({ ok: true, mapping_count: activeNodes.length });
    }

    if (body.action === "upsert_node") {
      const document = await loadOwnedMarkschemeDocument(admin, ownerProfileId, body.markscheme_document_id);
      if (body.mapped_question_node_id) await assertQuestionInVersion(admin, body.mapped_question_node_id, document.assessment_version_id);
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
      await auditOwnerAction(ownerProfileId, user.id, "markscheme_node.created", "markscheme_nodes", data.id);
      return json({ ok: true, node: data });
    }

    const { data: existingNode, error: existingNodeError } = await admin
      .from("markscheme_nodes")
      .select("id,markscheme_document_id")
      .eq("id", body.markscheme_node_id)
      .single();
    if (existingNodeError) throw existingNodeError;
    const document = await loadOwnedMarkschemeDocument(admin, ownerProfileId, existingNode.markscheme_document_id);
    if (body.action === "map_node") await assertQuestionInVersion(admin, body.question_node_id, document.assessment_version_id);
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
    await auditOwnerAction(ownerProfileId, user.id, `markscheme_node.${status}`, "markscheme_nodes", body.markscheme_node_id);
    return json({ ok: true, node: data });
  } catch (error) {
    return errorResponse(error, "markscheme-mapper failed");
  }
});

async function loadOwnedMarkschemeDocument(admin: any, ownerProfileId: string, documentId: string) {
  const { data: document, error: documentError } = await admin
    .from("markscheme_documents")
    .select("id,assessment_id,assessment_version_id,source_object_path,status")
    .eq("id", documentId)
    .single();
  if (documentError) throw documentError;
  const { data: assessment, error: assessmentError } = await admin
    .from("assessments")
    .select("owner_profile_id")
    .eq("id", document.assessment_id)
    .single();
  if (assessmentError) throw assessmentError;
  assertInstitutionOwner(assessment.owner_profile_id, ownerProfileId);
  const { data: version, error: versionError } = await admin
    .from("assessment_versions")
    .select("status")
    .eq("id", document.assessment_version_id)
    .single();
  if (versionError) throw versionError;
  assertVersionMutable(version.status);
  return document;
}

async function assertQuestionInVersion(admin: any, questionNodeId: string, versionId: string) {
  const { data, error } = await admin
    .from("question_nodes")
    .select("id")
    .eq("id", questionNodeId)
    .eq("assessment_version_id", versionId)
    .single();
  if (error) throw error;
  if (!data) throw new Error("Question is outside this markscheme version");
}

async function assertMappedQuestionsInVersion(admin: any, questionNodeIds: string[], versionId: string) {
  const uniqueIds = Array.from(new Set(questionNodeIds));
  const { data, error } = await admin
    .from("question_nodes")
    .select("id")
    .eq("assessment_version_id", versionId)
    .in("id", uniqueIds);
  if (error) throw error;
  if ((data ?? []).length !== uniqueIds.length) {
    throw new Error("One or more markscheme mappings point outside this assessment version");
  }
}

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
