import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

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
    const workerSecret = Deno.env.get("MINERU_WORKER_SECRET");
    if (!workerSecret) return json({ error: "MINERU_WORKER_SECRET is not configured" }, 500);
    const provided = request.headers.get("x-mineru-worker-secret") ?? "";
    if (provided !== workerSecret) return errorResponse(new Error("Unauthorized parser worker"), "complete-parse-job failed");

    const body = await readJson<Body>(request);
    if (!body.parse_job_id) return json({ error: "parse_job_id is required" }, 400);
    const admin = getAdminClient();
    const now = new Date().toISOString();

    const { data: parseJob, error: jobError } = await admin
      .from("parse_jobs")
      .update({
        status: body.ok ? "review_required" : "failed",
        result_object_path: body.result_object_path ?? null,
        error_message: body.error_message ?? null,
        completed_at: now,
      })
      .eq("id", body.parse_job_id)
      .select("assessment_version_id")
      .single();
    if (jobError) throw jobError;

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

    return json({ ok: true, status: body.ok ? "review_required" : "failed" });
  } catch (error) {
    return errorResponse(error, "complete-parse-job failed");
  }
});
