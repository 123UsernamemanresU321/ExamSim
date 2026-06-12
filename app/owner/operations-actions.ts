"use server";

import { revalidatePath } from "next/cache";
import { requireAppRole } from "@/lib/auth/server";
import { asJson, safeJsonObject, type SavedViewScope } from "@/lib/owner-operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const BULK_OPERATION_TYPES = new Set([
  "release_feedback",
  "grant_upload_extension",
  "mark_incident_reviewed",
  "queue_recovery_review",
  "assign_marker",
  "export_receipts",
]);
type BulkOperationType = "release_feedback" | "grant_upload_extension" | "mark_incident_reviewed" | "queue_recovery_review" | "assign_marker" | "export_receipts";

export async function saveOwnerSavedView(scope: SavedViewScope, formData: FormData) {
  const profile = await requireAppRole("owner", "/owner");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const supabase = await createSupabaseServerClient();
  const isDefault = formData.get("is_default") === "on";
  if (isDefault) {
    await supabase
      .from("owner_saved_views")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("owner_profile_id", profile?.id ?? "")
      .eq("view_scope", scope);
  }
  const { error } = await supabase.from("owner_saved_views").upsert(
    {
      owner_profile_id: profile?.id ?? "",
      view_scope: scope,
      name,
      filters_json: asJson(safeJsonObject(formData.get("filters_json"))),
      sort_json: asJson(safeJsonObject(formData.get("sort_json"))),
      columns_json: asJson(safeJsonObject(formData.get("columns_json"))),
      is_default: isDefault,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_profile_id,view_scope,name" },
  );
  if (error) throw error;
  await audit("owner_saved_view.upsert", "owner_saved_views", null, { scope, name });
  revalidateOwnerScope(scope);
}

export async function deleteOwnerSavedView(scope: SavedViewScope, viewId: string) {
  await requireAppRole("owner", "/owner");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("owner_saved_views").delete().eq("id", viewId);
  if (error) throw error;
  await audit("owner_saved_view.delete", "owner_saved_views", viewId, { scope });
  revalidateOwnerScope(scope);
}

export async function runOwnerBulkOperation(formData: FormData) {
  const profile = await requireAppRole("owner", "/owner/operations");
  const operationTypeRaw = String(formData.get("operation_type") ?? "");
  if (!BULK_OPERATION_TYPES.has(operationTypeRaw)) throw new Error("Unsupported bulk operation.");
  const operationType = operationTypeRaw as BulkOperationType;
  const targetIds = formData.getAll("target_ids").map(String).filter(Boolean);
  if (!targetIds.length) throw new Error("Select at least one target.");
  const request = {
    reason: String(formData.get("reason") ?? "").trim(),
    extra_seconds: Number(formData.get("extra_seconds") ?? 0),
  };
  const supabase = await createSupabaseServerClient();
  const { data: operation, error: opError } = await supabase
    .from("owner_bulk_operations")
    .insert({
      owner_profile_id: profile?.id ?? "",
      operation_type: operationType,
      target_kind: "attempt",
      target_ids: targetIds,
      status: "running",
      request_json: asJson(request),
    })
    .select("*")
    .single();
  if (opError) throw opError;

  const result = await executeBulkOperation(operationType, targetIds, request, profile?.id ?? "");
  const status = result.failed > 0 && result.completed > 0 ? "partial" : result.failed > 0 ? "failed" : "completed";
  const { error: updateError } = await supabase
    .from("owner_bulk_operations")
    .update({
      status,
      result_json: asJson(result),
      completed_at: new Date().toISOString(),
    })
    .eq("id", operation.id);
  if (updateError) throw updateError;
  await audit("owner_bulk_operation.run", "owner_bulk_operations", operation.id, { operation_type: operationType, target_ids: targetIds, status });
  revalidatePath("/owner/operations");
  revalidatePath("/owner/marking-queue");
  revalidatePath("/owner/support");
}

export async function assignMarker(formData: FormData) {
  const profile = await requireAppRole("owner", "/owner/marking-queue");
  const attemptId = String(formData.get("attempt_id") ?? "");
  const markerProfileId = String(formData.get("marker_profile_id") ?? "").trim() || profile?.id || "";
  const questionNodeId = String(formData.get("question_node_id") ?? "") || null;
  const assignmentScope = questionNodeId ? String(formData.get("assignment_scope") ?? "root_question") : "attempt";
  if (!attemptId || !markerProfileId) throw new Error("attempt_id and marker_profile_id are required.");
  const supabase = await createSupabaseServerClient();
  const { data: attempt, error: attemptError } = await supabase
    .from("attempts")
    .select("assessment_id")
    .eq("id", attemptId)
    .maybeSingle();
  if (attemptError) throw attemptError;
  if (!attempt) throw new Error("Attempt not found.");
  const { error } = await supabase.from("marker_assignments").insert({
    owner_profile_id: profile?.id ?? "",
    assessment_id: attempt.assessment_id,
    attempt_id: attemptId,
    question_node_id: questionNodeId,
    marker_profile_id: markerProfileId,
    assignment_scope: assignmentScope as "attempt" | "root_question" | "leaf_question",
    status: "assigned",
  });
  if (error) throw error;
  await audit("marker_assignment.create", "marker_assignments", attemptId, { assignment_scope: assignmentScope, marker_profile_id: markerProfileId });
  revalidatePath("/owner/marking-queue");
  revalidatePath("/owner/operations");
}

export async function updateMarkerAssignmentStatus(assignmentId: string, status: "assigned" | "in_progress" | "completed" | "released") {
  await requireAppRole("owner", "/owner/marking-queue");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("marker_assignments")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", assignmentId);
  if (error) throw error;
  await audit("marker_assignment.status", "marker_assignments", assignmentId, { status });
  revalidatePath("/owner/marking-queue");
}

async function executeBulkOperation(operationType: BulkOperationType, targetIds: string[], request: { reason: string; extra_seconds: number }, ownerProfileId: string) {
  const supabase = await createSupabaseServerClient();
  let completed = 0;
  let failed = 0;
  const messages: string[] = [];

  if (operationType === "grant_upload_extension") {
    const seconds = Number.isFinite(request.extra_seconds) && request.extra_seconds > 0 ? Math.floor(request.extra_seconds) : 600;
    const reason = request.reason || "Owner-granted upload extension";
    for (const attemptId of targetIds) {
      const { data: attempt, error: attemptError } = await supabase
        .from("attempts")
        .select("upload_deadline_at_utc,end_at_utc")
        .eq("id", attemptId)
        .maybeSingle();
      if (attemptError || !attempt) {
        failed += 1;
        messages.push(`${attemptId}: attempt not found`);
        continue;
      }
      const base = Date.parse(attempt.upload_deadline_at_utc ?? attempt.end_at_utc);
      const nextDeadline = new Date(base + seconds * 1000).toISOString();
      const [{ error: updateError }, { error: accommodationError }] = await Promise.all([
        supabase.from("attempts").update({ upload_deadline_at_utc: nextDeadline, updated_at: new Date().toISOString() }).eq("id", attemptId),
        supabase.from("attempt_accommodations").insert({
          attempt_id: attemptId,
          created_by_profile_id: ownerProfileId,
          accommodation_type: "upload_extension",
          extra_seconds: seconds,
          reason,
        }),
      ]);
      if (updateError || accommodationError) {
        failed += 1;
        messages.push(`${attemptId}: extension failed`);
      } else {
        completed += 1;
      }
    }
  } else if (operationType === "queue_recovery_review") {
    const { error } = await supabase.from("attempt_recovery_actions").insert(
      targetIds.map((attemptId) => ({
        attempt_id: attemptId,
        owner_profile_id: ownerProfileId,
        action_type: "log_note",
        details_json: asJson({ note: request.reason || "Queued for recovery review", source: "bulk_operation" }),
      })),
    );
    if (error) {
      failed = targetIds.length;
      messages.push(error.message);
    } else {
      completed = targetIds.length;
    }
  } else if (operationType === "mark_incident_reviewed") {
    const { data, error } = await supabase
      .from("student_incident_reports")
      .update({ status: "reviewed" })
      .in("attempt_id", targetIds)
      .eq("status", "submitted")
      .select("id");
    if (error) {
      failed = targetIds.length;
      messages.push(error.message);
    } else {
      completed = data?.length ?? 0;
    }
  } else if (operationType === "release_feedback") {
    const { data, error } = await supabase
      .from("feedback_releases")
      .update({
        visible_to_student: true,
        release_marks: true,
        release_comments: true,
        release_annotated_pdfs: true,
        released_at: new Date().toISOString(),
      })
      .in("attempt_id", targetIds)
      .is("revoked_at", null)
      .select("id");
    if (error) {
      failed = targetIds.length;
      messages.push(error.message);
    } else {
      completed = data?.length ?? 0;
      const missing = targetIds.length - completed;
      if (missing > 0) messages.push(`${missing} attempt(s) did not have an existing feedback release to publish.`);
    }
  } else {
    completed = targetIds.length;
    messages.push("Operation recorded for audit; no direct mutation required.");
  }

  return { completed, failed, messages };
}

async function audit(action: string, targetTable: string, targetId: string | null, metadata: Record<string, unknown>) {
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("audit_owner_action", {
    action,
    target_table: targetTable,
    target_id: targetId,
    metadata_json: asJson(metadata),
  });
}

function revalidateOwnerScope(scope: SavedViewScope) {
  const paths: Record<SavedViewScope, string> = {
    assessments: "/owner/assessments",
    attempts: "/owner/attempts",
    marking_queue: "/owner/marking-queue",
    marking_workspace: "/owner/marking-queue",
    feedback: "/owner/feedback-releases",
    students: "/owner/students",
    question_bank: "/owner/question-bank",
    security: "/owner/security",
    support_console: "/owner/support",
  };
  revalidatePath(paths[scope]);
}
