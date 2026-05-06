import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, profileForAuthUser, requireOwner } from "../_shared/auth.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";

type IngestBody = {
  title: string;
  paper_code?: string;
  external_schedule_ref?: string;
  assessment_kind: "practice_paper" | "quiz" | "test" | "exam";
  source_kind: "pdf" | "latex" | "json";
  latex_source?: string;
  json_package?: Record<string, unknown>;
  uploaded_source_path?: string;
};

type FlatNode = {
  node_key: string;
  ordinal: number;
  node_type: "section" | "question" | "subquestion" | "part";
  title?: string | null;
  prompt_html?: string | null;
  prompt_latex?: string | null;
  marks?: number | null;
  response_mode?: string;
  interaction_json?: unknown;
  parent_node_key?: string | null;
};

function cleanLatexTitle(line: string) {
  return line
    .replace(/^\\(?:section|subsection|subsubsection)\*?\{(.+)\}$/i, "$1")
    .replace(/^\\(?:begin|end)\{[^}]+\}/i, "")
    .trim();
}

function extractMarks(line: string) {
  const match = line.match(/(?:\[|\()(\d+(?:\.\d+)?)\s*(?:marks?|pts?|points?)(?:\]|\))/i);
  return match ? Number(match[1]) : null;
}

function latexToNodes(source: string) {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const nodes: FlatNode[] = [];
  let questionOrdinal = 1;
  let sectionOrdinal = 1;
  let subOrdinal = 1;
  let partOrdinal = 1;
  let currentQuestionKey: string | null = null;
  let currentSubquestionKey: string | null = null;

  for (const line of lines) {
    const section = line.match(/^\\(?:section|subsection)\*?\{(.+)\}$/i);
    const question = line.match(/^(?:\\question\b|question\s+|q)(\d+)[.)\s:]*/i) ?? line.match(/^(\d+)[.)]\s+/);
    const subquestion = line.match(/^(?:\\item\s*)?\(([a-z])\)\s+/i);
    const romanPart = line.match(/^(?:\\item\s*)?\((i{1,3}|iv|v|vi{0,3}|ix|x)\)\s+/i);

    if (section) {
      nodes.push({
        node_key: `S${sectionOrdinal}`,
        ordinal: sectionOrdinal,
        node_type: "section",
        title: cleanLatexTitle(line),
        prompt_latex: line,
        response_mode: "none",
        marks: null,
      });
      sectionOrdinal += 1;
      continue;
    }

    if (question) {
      currentQuestionKey = String(question[1] ?? questionOrdinal);
      currentSubquestionKey = null;
      subOrdinal = 1;
      partOrdinal = 1;
      nodes.push({
        node_key: currentQuestionKey,
        ordinal: questionOrdinal,
        node_type: "question",
        title: cleanLatexTitle(line),
        prompt_latex: line,
        response_mode: "typed_or_upload",
        marks: extractMarks(line),
      });
      questionOrdinal += 1;
      continue;
    }

    if (subquestion && currentQuestionKey) {
      const label = subquestion[1].toLowerCase();
      currentSubquestionKey = `${currentQuestionKey}(${label})`;
      partOrdinal = 1;
      nodes.push({
        node_key: currentSubquestionKey,
        parent_node_key: currentQuestionKey,
        ordinal: subOrdinal,
        node_type: "subquestion",
        title: `Part (${label})`,
        prompt_latex: line,
        response_mode: "typed_or_upload",
        marks: extractMarks(line),
      });
      subOrdinal += 1;
      continue;
    }

    if (romanPart && (currentSubquestionKey || currentQuestionKey)) {
      const label = romanPart[1].toLowerCase();
      nodes.push({
        node_key: `${currentSubquestionKey ?? currentQuestionKey}(${label})`,
        parent_node_key: currentSubquestionKey ?? currentQuestionKey,
        ordinal: partOrdinal,
        node_type: "part",
        title: `Part (${label})`,
        prompt_latex: line,
        response_mode: "typed_or_upload",
        marks: extractMarks(line),
      });
      partOrdinal += 1;
    }
  }
  return nodes.length > 0
    ? nodes
    : [{ node_key: "1", ordinal: 1, node_type: "question", title: "Manual review required", prompt_latex: source.slice(0, 500), response_mode: "typed_or_upload" }];
}

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireOwner(request);
    const profile = await profileForAuthUser(user.id);
    const body = await readJson<IngestBody>(request);
    if (!body.title || !body.assessment_kind || !body.source_kind) return json({ error: "Missing assessment fields" }, 400);

    const { data: assessment, error: assessmentError } = await admin
      .from("assessments")
      .insert({
        owner_profile_id: profile.id,
        title: body.title,
        paper_code: body.paper_code ?? null,
        external_schedule_ref: body.external_schedule_ref ?? null,
        assessment_kind: body.assessment_kind,
      })
      .select("*")
      .single();
    if (assessmentError) throw assessmentError;

    const parseConfidence = body.source_kind === "json" ? 1 : body.source_kind === "latex" ? 0.62 : 0.15;
    const requiresReview = parseConfidence < 0.9;
    const normalizedPackage =
      body.source_kind === "json" && body.json_package
        ? body.json_package
        : {
            schema_version: "2026-05-05",
            assessment: {
              id: assessment.id,
              title: assessment.title,
              paper_code: assessment.paper_code,
              assessment_kind: assessment.assessment_kind,
              source_kind: body.source_kind,
              authoring_origin: body.source_kind === "pdf" ? "owner_uploaded" : "owner_pasted",
              external_schedule_ref: body.external_schedule_ref,
              display_timezone: "Africa/Johannesburg",
            },
            delivery: {
              delivery_mode: "browser",
              solutions_requested: true,
              response_policy: {
                typed_allowed: true,
                mixed_mode_allowed: true,
                per_question_pdf_upload: true,
                blank_submission_required_for_unattempted: false,
              },
            },
            source: {
              original_object_path: body.uploaded_source_path,
              normalized_by: "edge-ingest:mvp",
              parse_confidence: parseConfidence,
              requires_owner_review: requiresReview,
            },
            questions: [],
          };

    const versionId = crypto.randomUUID();
    const packageStorage = await storeNormalizedPackageObject(admin, profile.id, versionId, normalizedPackage);
    const { data: version, error: versionError } = await admin
      .from("assessment_versions")
      .insert({
        id: versionId,
        assessment_id: assessment.id,
        version_no: 1,
        status: requiresReview ? "review_required" : "draft",
        source_kind: body.source_kind,
        source_object_path: body.uploaded_source_path ?? null,
        normalized_package_json: packageStorage.encrypted_package_path ? null : normalizedPackage,
        parse_confidence: parseConfidence,
        requires_owner_review: requiresReview,
        ...packageStorage,
      })
      .select("*")
      .single();
    if (versionError) throw versionError;

    const nodes =
      body.source_kind === "json" && Array.isArray(body.json_package?.questions)
        ? flattenPackageNodes(body.json_package.questions as Record<string, unknown>[])
        : body.source_kind === "latex"
          ? latexToNodes(body.latex_source ?? "")
          : [{ node_key: "1", ordinal: 1, node_type: "question", title: "PDF manual question tree", response_mode: "typed_or_upload" }];

    const rows = nodes.map((node: Record<string, unknown>, index: number) => ({
      assessment_version_id: version.id,
      node_key: String(node.node_key ?? index + 1),
      ordinal: Number(node.ordinal ?? index + 1),
      node_type: String(node.node_type ?? "question"),
      title: typeof node.title === "string" ? node.title : null,
      prompt_html: typeof node.prompt_html === "string" ? node.prompt_html : typeof node.prompt === "object" ? (node.prompt as { html?: string }).html ?? null : null,
      prompt_latex: typeof node.prompt_latex === "string" ? node.prompt_latex : typeof node.prompt === "object" ? (node.prompt as { latex?: string }).latex ?? null : null,
      marks: typeof node.marks === "number" ? node.marks : null,
      response_mode: String(node.response_mode ?? "typed_or_upload"),
      interaction_json: typeof node.interaction === "object" ? node.interaction : null,
    }));
    const { data: insertedNodes, error: nodeError } = await admin.from("question_nodes").insert(rows).select("id,node_key");
    if (nodeError) throw nodeError;

    const idByKey = new Map((insertedNodes ?? []).map((node) => [node.node_key, node.id]));
    for (const node of nodes) {
      if (!node.parent_node_key) continue;
      const parentId = idByKey.get(String(node.parent_node_key));
      const nodeId = idByKey.get(String(node.node_key));
      if (parentId && nodeId) {
        await admin.from("question_nodes").update({ parent_node_id: parentId }).eq("id", nodeId);
      }
    }

    let parseJobId: string | null = null;
    if (body.source_kind === "pdf" && body.uploaded_source_path) {
      const { data: parseJob, error: parseJobError } = await admin
        .from("parse_jobs")
        .insert({
          assessment_version_id: version.id,
          owner_profile_id: profile.id,
          source_object_path: body.uploaded_source_path,
          parser: "mineru",
          status: "queued",
          requested_ocr: true,
        })
        .select("id")
        .single();
      if (parseJobError) throw parseJobError;
      parseJobId = parseJob.id;
    }

    await auditOwnerAction(profile.id, user.id, "assessment.ingested", "assessment_versions", version.id, {
      source_kind: body.source_kind,
      parse_job_id: parseJobId,
    });

    return json({
      assessment_id: assessment.id,
      draft_version_id: version.id,
      parse_confidence: parseConfidence,
      requires_owner_review: requiresReview,
      parse_job_id: parseJobId,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "ingest-assessment failed" }, 401);
  }
});

function flattenPackageNodes(nodes: Record<string, unknown>[], parentNodeKey: string | null = null): FlatNode[] {
  const flattened: FlatNode[] = [];
  nodes.forEach((node, index) => {
    const nodeKey = String(node.node_key ?? node.node_id ?? index + 1);
    const prompt = typeof node.prompt === "object" && node.prompt ? node.prompt as { html?: string; latex?: string } : {};
    flattened.push({
      node_key: nodeKey,
      parent_node_key: parentNodeKey,
      ordinal: Number(node.ordinal ?? index + 1),
      node_type: String(node.node_type ?? "question") as FlatNode["node_type"],
      title: typeof node.title === "string" ? node.title : null,
      prompt_html: typeof node.prompt_html === "string" ? node.prompt_html : prompt.html ?? null,
      prompt_latex: typeof node.prompt_latex === "string" ? node.prompt_latex : prompt.latex ?? null,
      marks: typeof node.marks === "number" ? node.marks : null,
      response_mode: String(node.response_mode ?? "typed_or_upload"),
      interaction_json: typeof node.interaction === "object" ? node.interaction : null,
    });
    if (Array.isArray(node.children)) {
      flattened.push(...flattenPackageNodes(node.children as Record<string, unknown>[], nodeKey));
    }
  });
  return flattened;
}

async function storeNormalizedPackageObject(
  admin: {
    storage: {
      from(bucket: string): {
        upload(path: string, body: Uint8Array, options: { contentType: string; upsert: boolean }): Promise<{ error: Error | null }>;
      };
    };
    from(table: "encrypted_object_envelopes"): {
      insert(row: Record<string, unknown>): {
        select(columns: string): {
          single(): Promise<{ data: { id: string } | null; error: Error | null }>;
        };
      };
    };
  },
  ownerProfileId: string,
  versionId: string,
  normalizedPackage: unknown,
) {
  const plaintext = new TextEncoder().encode(JSON.stringify(normalizedPackage, null, 2));
  const basePath = `${ownerProfileId}/versions/${versionId}/normalized-package.json`;
  const encrypted = await maybeEncrypt(plaintext);
  const objectPath = encrypted ? `${basePath}.enc` : basePath;
  const { error } = await admin.storage.from("assessment-packages").upload(objectPath, encrypted?.ciphertextBytes ?? plaintext, {
    contentType: encrypted ? "application/octet-stream" : "application/json",
    upsert: false,
  });
  if (error) throw error;
  if (encrypted) {
    const { error: envelopeError } = await admin
      .from("encrypted_object_envelopes")
      .insert({
        owner_profile_id: ownerProfileId,
        bucket_id: "assessment-packages",
        object_path: objectPath,
        kms_provider: "cloudflare",
        algorithm: "AES-GCM",
        wrapped_data_key: encrypted.wrappedDataKey,
        iv: encrypted.iv,
        metadata_json: { purpose: "assessment_package", assessment_version_id: versionId },
      })
      .select("id")
      .single();
    if (envelopeError) throw envelopeError;
    return {
      encrypted_package_path: objectPath,
      kms_provider: "cloudflare",
      wrapped_data_key: encrypted.wrappedDataKey,
      encryption_metadata_json: { algorithm: "AES-GCM", iv: encrypted.iv, purpose: "assessment_package" },
    };
  }
  return { normalized_package_path: objectPath };
}

async function maybeEncrypt(plaintextBytes: Uint8Array) {
  if (Deno.env.get("EXTERNAL_KMS_PROVIDER") !== "cloudflare") return null;
  const wrapUrl = Deno.env.get("EXTERNAL_KMS_WRAP_URL");
  const adminToken = Deno.env.get("EXTERNAL_KMS_ADMIN_TOKEN");
  if (!wrapUrl || !adminToken) throw new Error("Cloudflare KMS wrapper is not configured");
  const dataKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", dataKey, "AES-GCM", false, ["encrypt"]);
  const ciphertextBytes = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintextBytes));
  const wrapResponse = await fetch(wrapUrl, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ plaintextDataKey: base64(dataKey) }),
  });
  if (!wrapResponse.ok) throw new Error("Cloudflare KMS key wrap failed");
  const wrapped = await wrapResponse.json();
  if (typeof wrapped.wrappedDataKey !== "string") throw new Error("Cloudflare KMS returned invalid wrapped key");
  return { ciphertextBytes, wrappedDataKey: wrapped.wrappedDataKey, iv: base64(iv) };
}

function base64(value: Uint8Array) {
  return btoa(Array.from(value, (byte) => String.fromCharCode(byte)).join(""));
}
