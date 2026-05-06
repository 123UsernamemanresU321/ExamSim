import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";
import { loadNormalizedPackage } from "../_shared/package-storage.ts";

type Body = {
  assessment_version_id: string;
  source_kind: "pdf" | "latex" | "json" | "mineru";
  source_text?: string;
  artifact_object_path?: string;
  owner_notes?: string;
  repair?: boolean;
};

type StorageAdmin = {
  storage: {
    from(bucket: string): {
      createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string }; error: Error | null }>;
    };
  };
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireOwnerAal2(request);
    const ownerProfile = await profileForAuthUser(user.id);
    const body = await readJson<Body>(request);
    if (!body.assessment_version_id) return json({ error: "assessment_version_id is required" }, 400);

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!apiKey) return json({ error: "DEEPSEEK_API_KEY is not configured" }, 500);
    const provider = Deno.env.get("AI_PARSE_PROVIDER") || "deepseek";
    if (provider !== "deepseek") return json({ error: "Only DeepSeek is configured for production AI parse" }, 500);
    const model = body.repair
      ? Deno.env.get("AI_PARSE_REPAIR_MODEL") || "deepseek-v4-pro"
      : Deno.env.get("AI_PARSE_MODEL") || "deepseek-v4-flash";

    const { data: version, error: versionError } = await admin
      .from("assessment_versions")
      .select("*, assessments(title, paper_code, assessment_kind, owner_profile_id)")
      .eq("id", body.assessment_version_id)
      .single();
    if (versionError) throw versionError;
    if (version.assessments?.owner_profile_id !== ownerProfile.id) return json({ error: "Forbidden" }, 403);

    const sourceText = await loadSourceText(admin, body);
    const existingPackage = await loadNormalizedPackage(admin, version);
    if (!sourceText.trim()) return json({ error: "source_text or artifact_object_path is required" }, 400);

    const { data: parseJob, error: parseJobError } = await admin
      .from("parse_jobs")
      .insert({
        assessment_version_id: body.assessment_version_id,
        owner_profile_id: ownerProfile.id,
        source_object_path: body.artifact_object_path ?? version.source_object_path ?? "owner-pasted-source",
        parser: "deepseek_ai",
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (parseJobError) throw parseJobError;

    const deepseekResponse = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content:
              "Return JSON only with normalized_package, confidence, warnings, and review_required=true. Follow the Exam Vault normalized package shape. Do not publish, finalize, or accuse. Use warnings for uncertain structure.",
          },
          {
            role: "user",
            content: [
              `Title: ${version.assessments?.title ?? "Untitled assessment"}`,
              `Paper code: ${version.assessments?.paper_code ?? ""}`,
              `Source kind: ${body.source_kind}`,
              `Existing package JSON: ${JSON.stringify(existingPackage ?? {})}`,
              `Owner notes: ${body.owner_notes ?? ""}`,
              `Source text: ${sourceText.slice(0, 80_000)}`,
            ].join("\n\n"),
          },
        ],
      }),
    });
    if (!deepseekResponse.ok) {
      const errorText = await deepseekResponse.text();
      throw new Error(`DeepSeek parse failed: ${deepseekResponse.status} ${errorText.slice(0, 500)}`);
    }
    const completion = await deepseekResponse.json();
    const content = completion?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("DeepSeek did not return message content");
    const suggestion = normalizeSuggestion(JSON.parse(content));

    const { data: saved, error: suggestionError } = await admin
      .from("ai_parse_suggestions")
      .insert({
        assessment_version_id: body.assessment_version_id,
        parse_job_id: parseJob.id,
        owner_profile_id: ownerProfile.id,
        provider,
        model,
        source_kind: body.source_kind,
        normalized_package_json: suggestion.normalized_package,
        confidence: suggestion.confidence,
        warnings_json: suggestion.warnings,
        review_required: true,
        status: "proposed",
      })
      .select("*")
      .single();
    if (suggestionError) throw suggestionError;

    await admin
      .from("parse_jobs")
      .update({
        status: "review_required",
        completed_at: new Date().toISOString(),
        result_object_path: null,
      })
      .eq("id", parseJob.id);

    await auditOwnerAction(ownerProfile.id, user.id, "ai_parse.proposed", "assessment_versions", body.assessment_version_id, {
      provider,
      model,
      source_kind: body.source_kind,
      confidence: suggestion.confidence,
    });

    return json({ ok: true, suggestion: saved });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "ai-parse-assessment failed" }, 401);
  }
});

async function loadSourceText(admin: StorageAdmin, body: Body) {
  if (body.source_text?.trim()) return body.source_text;
  if (!body.artifact_object_path) return "";
  const { data, error } = await admin.storage.from("assessment-packages").createSignedUrl(body.artifact_object_path, 60);
  if (error) throw error;
  const response = await fetch(data.signedUrl);
  if (!response.ok) throw new Error("Could not read parse artifact");
  return await response.text();
}

function normalizeSuggestion(raw: Record<string, unknown>) {
  const normalizedPackage = raw.normalized_package;
  if (!normalizedPackage || typeof normalizedPackage !== "object") throw new Error("AI response missing normalized_package");
  const confidence = typeof raw.confidence === "number" ? raw.confidence : 0.5;
  const warnings = Array.isArray(raw.warnings) ? raw.warnings.map(String).filter(Boolean) : [];
  if (!warnings.some((warning) => /owner review/i.test(warning))) warnings.push("Owner review is mandatory before publish.");
  return {
    normalized_package: normalizedPackage,
    confidence: Math.max(0, Math.min(1, confidence)),
    warnings,
  };
}
