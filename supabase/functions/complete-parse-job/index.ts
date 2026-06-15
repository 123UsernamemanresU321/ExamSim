import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase.ts";
import { errorResponse, handleOptions, json } from "../_shared/http.ts";
import { verifyMineruWorkerRequest } from "../_shared/webhook-signature.ts";

type Body = {
  parse_job_id: string;
  ok: boolean;
  result_object_path?: string;
  error_message?: string;
  artifacts?: {
    artifact_kind: "markdown" | "json" | "html" | "layout" | "log" | "zip";
    object_path: string;
    content_preview?: string;
  }[];
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const rawBody = await request.text();
    const verification = await verifyMineruWorkerRequest(request, rawBody);
    let body: Body;
    try {
      body = JSON.parse(rawBody) as Body;
    } catch {
      return json(request, { error: "Invalid JSON body" }, 400);
    }
    if (!body.parse_job_id) return json(request, { error: "parse_job_id is required" }, 400);
    const admin = getAdminClient();
    const now = new Date().toISOString();

    const { data: existingJob, error: existingJobError } = await admin
      .from("parse_jobs")
      .select("id,status,assessment_version_id")
      .eq("id", body.parse_job_id)
      .maybeSingle();
    if (existingJobError) throw existingJobError;
    if (!existingJob?.id) return json(request, { error: "parse_job_id was not found" }, 400);

    const insertedCallback = await recordWorkerCallback(admin, verification, body, now);
    if (!insertedCallback) return json(request, { ok: true, duplicate: true, status: "ignored" });
    if (!["queued", "running"].includes(String(existingJob.status))) {
      await markWorkerCallback(admin, verification.deliveryId, "ignored", { reason: "parse_job_already_finalized", status: existingJob.status });
      return json(request, { ok: true, status: existingJob.status, ignored: true });
    }

    const { data: parseJob, error: jobError } = await admin
      .from("parse_jobs")
      .update({
        status: body.ok ? "review_required" : "failed",
        result_object_path: body.result_object_path ?? null,
        error_message: body.error_message ?? null,
        completed_at: now,
      })
      .eq("id", body.parse_job_id)
      .in("status", ["queued", "running"])
      .select("assessment_version_id")
      .maybeSingle();
    if (jobError) throw jobError;
    if (!parseJob?.assessment_version_id) {
      await markWorkerCallback(admin, verification.deliveryId, "ignored", { reason: "parse_job_update_not_applied" });
      return json(request, { ok: true, status: "ignored" });
    }

    if (body.artifacts?.length) {
      const { error: artifactError } = await admin.from("parse_job_artifacts").insert(
        body.artifacts.map((artifact) => ({
          parse_job_id: body.parse_job_id,
          artifact_kind: artifact.artifact_kind,
          object_path: artifact.object_path,
          content_preview: artifact.content_preview ?? null,
        })),
      );
      if (artifactError) throw artifactError;
    }

    if (body.ok && body.result_object_path) {
      await admin
        .from("assessment_versions")
        .update({
          normalized_package_path: body.result_object_path,
          parse_confidence: 0.72,
          requires_owner_review: true,
          status: "review_required",
        })
        .eq("id", parseJob.assessment_version_id);
    }

    await markWorkerCallback(admin, verification.deliveryId, "accepted", { ok: body.ok, used_legacy_secret: verification.usedLegacySecret });
    return json(request, { ok: true, status: body.ok ? "review_required" : "failed" });
  } catch (error) {
    return errorResponse(request, error, "complete-parse-job failed");
  }
});

async function recordWorkerCallback(admin: any, verification: Awaited<ReturnType<typeof verifyMineruWorkerRequest>>, body: Body, now: string) {
  const { error } = await admin.from("parse_worker_callbacks").insert({
    delivery_id: verification.deliveryId,
    parse_job_id: body.parse_job_id,
    signed_at: verification.usedLegacySecret ? null : new Date(Number(/^\d+$/.test(verification.timestamp) ? Number(verification.timestamp) * (verification.timestamp.length <= 10 ? 1000 : 1) : Date.parse(verification.timestamp))).toISOString(),
    signature_prefix: verification.signature === "legacy" ? "legacy" : verification.signature.slice(0, 16),
    status: "received",
    received_at: now,
    metadata_json: {
      ok: body.ok,
      result_object_path: body.result_object_path ?? null,
      artifact_count: body.artifacts?.length ?? 0,
      used_legacy_secret: verification.usedLegacySecret,
    },
  });
  if (!error) return true;
  if (String((error as { code?: string }).code) === "23505") return false;
  throw error;
}

async function markWorkerCallback(admin: any, deliveryId: string, status: "accepted" | "ignored" | "failed", metadata: Record<string, unknown>) {
  await admin
    .from("parse_worker_callbacks")
    .update({ status, metadata_json: metadata })
    .eq("delivery_id", deliveryId);
}
