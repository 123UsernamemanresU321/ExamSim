import { computeAttemptState } from "@/lib/attempt-state";
import type { AttemptState } from "@/lib/constants";
import { isDemoModeEnabled } from "@/lib/runtime";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Assessment,
  AssessmentVersion,
  Attempt,
  AttemptEvent,
  FeedbackRelease,
  Json,
  MarkerAssignment,
  OwnerBulkOperation,
  OwnerSavedView,
  Profile,
  QuestionNodeRow,
  StudentIncidentReport,
  UploadQueueEvent,
  UploadSlot,
} from "@/types/database";

export type SavedViewScope = OwnerSavedView["view_scope"];

export type SavedViewPayload = {
  filters?: Record<string, unknown>;
  sort?: Record<string, unknown>;
  columns?: Record<string, unknown>;
};

export type OperationsBoardRow = {
  attempt: Attempt;
  assessment: Pick<Assessment, "id" | "title" | "paper_code" | "subject"> | null;
  student: Pick<Profile, "id" | "display_name"> | null;
  state: AttemptState;
  uploadSummary: {
    total: number;
    uploaded: number;
    missing: number;
    failedQueueEvents: number;
  };
  incidents: number;
  moderationEvents: number;
  lastEventAt: string | null;
};

export type StudentSupportRow = {
  attempt: Attempt;
  assessment: Pick<Assessment, "id" | "title" | "paper_code" | "subject"> | null;
  student: Pick<Profile, "id" | "display_name"> | null;
  state: OperationsBoardRow["state"];
  slots: UploadSlot[];
  incidents: StudentIncidentReport[];
  queueEvents: UploadQueueEvent[];
  feedbackRelease: FeedbackRelease | null;
};

export type PackageIntegrityReport = {
  status: "ready" | "warning" | "blocked";
  blockers: string[];
  warnings: string[];
  checks: Array<{ label: string; status: "pass" | "warning" | "blocked"; detail: string }>;
};

export type PublishDiffSummary = {
  latestVersion: AssessmentVersion | null;
  questionCount: number;
  rootQuestionCount: number;
  uploadRootOnly: boolean;
  markschemeMappedCount: number;
  deliveryWarnings: string[];
};

export type DestructivePreview = {
  targetKind: "assessment" | "attempt" | "question_bank_item";
  targetId: string;
  title: string;
  warnings: string[];
  counts: Record<string, number>;
};

export async function listOwnerSavedViews(scope: SavedViewScope): Promise<OwnerSavedView[]> {
  if (isDemoModeEnabled()) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("owner_saved_views")
    .select("*")
    .eq("view_scope", scope)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as OwnerSavedView[];
}

export async function listMarkerAssignments(): Promise<MarkerAssignment[]> {
  if (isDemoModeEnabled()) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("marker_assignments")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MarkerAssignment[];
}

export async function getOperationsBoard(): Promise<OperationsBoardRow[]> {
  if (isDemoModeEnabled()) return [];
  const supabase = await createSupabaseServerClient();
  const { data: attempts, error: attemptError } = await supabase
    .from("attempts")
    .select("*")
    .order("start_at_utc", { ascending: true })
    .limit(100);
  if (attemptError) throw attemptError;
  return buildOperationsRows((attempts ?? []) as Attempt[]);
}

export async function getStudentSupportConsole(search: string | null): Promise<StudentSupportRow[]> {
  if (isDemoModeEnabled()) return [];
  const supabase = await createSupabaseServerClient();
  const query = search?.trim().toLowerCase() ?? "";
  const { data: attempts, error } = await supabase
    .from("attempts")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(80);
  if (error) throw error;

  const rows = await buildSupportRows((attempts ?? []) as Attempt[]);
  if (!query) return rows;
  return rows.filter((row) => {
    const haystack = [
      row.assessment?.title,
      row.assessment?.paper_code,
      row.student?.display_name,
      row.attempt.id,
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
  });
}

export async function getPublishDiffSummary(assessmentId: string): Promise<PublishDiffSummary> {
  if (isDemoModeEnabled()) {
    return {
      latestVersion: null,
      questionCount: 0,
      rootQuestionCount: 0,
      uploadRootOnly: true,
      markschemeMappedCount: 0,
      deliveryWarnings: [],
    };
  }
  const supabase = await createSupabaseServerClient();
  const { data: versions, error: versionError } = await supabase
    .from("assessment_versions")
    .select("*")
    .eq("assessment_id", assessmentId)
    .order("version_no", { ascending: false })
    .limit(1);
  if (versionError) throw versionError;
  const latestVersion = (versions?.[0] ?? null) as AssessmentVersion | null;
  if (!latestVersion) {
    return {
      latestVersion: null,
      questionCount: 0,
      rootQuestionCount: 0,
      uploadRootOnly: true,
      markschemeMappedCount: 0,
      deliveryWarnings: ["No assessment version is available to publish."],
    };
  }
  const [{ data: nodes, error: nodeError }, { data: markschemeNodes, error: markschemeError }] = await Promise.all([
    supabase.from("question_nodes").select("*").eq("assessment_version_id", latestVersion.id).order("ordinal"),
    supabase.from("markscheme_nodes").select("*").eq("status", "mapped"),
  ]);
  if (nodeError) throw nodeError;
  if (markschemeError) throw markschemeError;
  const questionNodes = (nodes ?? []) as QuestionNodeRow[];
  const roots = questionNodes.filter((node) => node.node_type !== "section" && !node.parent_node_id && (node.depth ?? 0) === 0);
  const childUploadNodes = questionNodes.filter((node) => node.parent_node_id && String(node.response_mode).includes("upload"));
  return {
    latestVersion,
    questionCount: questionNodes.filter((node) => node.node_type !== "section").length,
    rootQuestionCount: roots.length,
    uploadRootOnly: childUploadNodes.length === 0,
    markschemeMappedCount: (markschemeNodes ?? []).length,
    deliveryWarnings: [
      latestVersion.requires_owner_review ? "Latest version is still marked review-required." : null,
      childUploadNodes.length ? `${childUploadNodes.length} child node(s) still have upload response modes.` : null,
      roots.length === 0 ? "No root questions were detected." : null,
    ].filter(Boolean) as string[],
  };
}

export async function getPackageIntegrityReport(assessmentId: string): Promise<PackageIntegrityReport> {
  const summary = await getPublishDiffSummary(assessmentId);
  const checks: PackageIntegrityReport["checks"] = [];
  checks.push({
    label: "Published package",
    status: summary.latestVersion?.encrypted_package_path || summary.latestVersion?.normalized_package_json ? "pass" : "blocked",
    detail: summary.latestVersion ? "Latest version has package data for server-side release." : "No latest assessment version found.",
  });
  checks.push({
    label: "Root-question uploads",
    status: summary.uploadRootOnly ? "pass" : "blocked",
    detail: summary.uploadRootOnly ? "Upload ownership is root-question only." : "Child question upload modes must be repaired before publishing.",
  });
  checks.push({
    label: "Question tree",
    status: summary.rootQuestionCount > 0 ? "pass" : "blocked",
    detail: `${summary.rootQuestionCount} root question(s), ${summary.questionCount} total question node(s).`,
  });
  checks.push({
    label: "Markscheme mapping",
    status: summary.markschemeMappedCount > 0 ? "pass" : "warning",
    detail: summary.markschemeMappedCount > 0 ? `${summary.markschemeMappedCount} mapped markscheme section(s).` : "No mapped markscheme sections were detected.",
  });
  checks.push({
    label: "Server release boundary",
    status: "pass",
    detail: "Exam package release remains behind server/Edge state checks; no client preloading is introduced.",
  });
  const blockers = checks.filter((check) => check.status === "blocked").map((check) => `${check.label}: ${check.detail}`);
  const warnings = [...summary.deliveryWarnings, ...checks.filter((check) => check.status === "warning").map((check) => `${check.label}: ${check.detail}`)];
  return {
    status: blockers.length ? "blocked" : warnings.length ? "warning" : "ready",
    blockers,
    warnings,
    checks,
  };
}

export async function getDestructiveActionPreview(targetKind: DestructivePreview["targetKind"], targetId: string): Promise<DestructivePreview> {
  const supabase = await createSupabaseServerClient();
  if (targetKind === "assessment") {
    const [{ data: assessment }, { count: versions }, { count: attempts }] = await Promise.all([
      supabase.from("assessments").select("title").eq("id", targetId).maybeSingle(),
      supabase.from("assessment_versions").select("*", { count: "exact", head: true }).eq("assessment_id", targetId),
      supabase.from("attempts").select("*", { count: "exact", head: true }).eq("assessment_id", targetId),
    ]);
    return {
      targetKind,
      targetId,
      title: assessment?.title ?? "Assessment",
      counts: { versions: versions ?? 0, attempts: attempts ?? 0 },
      warnings: ["Deleting an assessment removes associated versions and operational context through database cascades."],
    };
  }
  if (targetKind === "attempt") {
    const [{ data: attempt }, { count: uploadSlots }, { count: marks }, { count: events }] = await Promise.all([
      supabase.from("attempts").select("id").eq("id", targetId).maybeSingle(),
      supabase.from("upload_slots").select("*", { count: "exact", head: true }).eq("attempt_id", targetId),
      supabase.from("marks").select("*", { count: "exact", head: true }).eq("attempt_id", targetId),
      supabase.from("attempt_events").select("*", { count: "exact", head: true }).eq("attempt_id", targetId),
    ]);
    return {
      targetKind,
      targetId,
      title: attempt?.id ?? "Attempt",
      counts: { uploadSlots: uploadSlots ?? 0, marks: marks ?? 0, events: events ?? 0 },
      warnings: ["Deleting an attempt removes student submission records, moderation events, marks, and upload-slot metadata."],
    };
  }
  const [{ data: item }, { count: children }] = await Promise.all([
    supabase.from("question_bank_items").select("title,root_node_key").eq("id", targetId).maybeSingle(),
    supabase.from("question_bank_children").select("*", { count: "exact", head: true }).eq("question_bank_item_id", targetId),
  ]);
  return {
    targetKind,
    targetId,
    title: item?.title ?? item?.root_node_key ?? "Question bank item",
    counts: { childNodes: children ?? 0 },
    warnings: ["Deleting a question bank item removes its reusable child-question tree."],
  };
}

export async function getRecentBulkOperations(limit = 12): Promise<OwnerBulkOperation[]> {
  if (isDemoModeEnabled()) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("owner_bulk_operations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as OwnerBulkOperation[];
}

async function buildOperationsRows(attempts: Attempt[]): Promise<OperationsBoardRow[]> {
  const supabase = await createSupabaseServerClient();
  const attemptIds = attempts.map((attempt) => attempt.id);
  const assessmentIds = [...new Set(attempts.map((attempt) => attempt.assessment_id))];
  const studentIds = [...new Set(attempts.map((attempt) => attempt.assignee_profile_id).filter((id): id is string => Boolean(id)))];
  const [
    { data: assessments, error: assessmentError },
    { data: profiles, error: profileError },
    { data: slots, error: slotError },
    { data: queueEvents, error: queueError },
    { data: incidents, error: incidentError },
    { data: events, error: eventError },
  ] = await Promise.all([
    assessmentIds.length ? supabase.from("assessments").select("id,title,paper_code,subject").in("id", assessmentIds) : ok([]),
    studentIds.length ? supabase.from("profiles").select("id,display_name").in("id", studentIds) : ok([]),
    attemptIds.length ? supabase.from("upload_slots").select("*").in("attempt_id", attemptIds) : ok([]),
    attemptIds.length ? supabase.from("upload_queue_events").select("*").order("created_at", { ascending: false }).limit(500) : ok([]),
    attemptIds.length ? supabase.from("student_incident_reports").select("*").in("attempt_id", attemptIds) : ok([]),
    attemptIds.length ? supabase.from("attempt_events").select("*").in("attempt_id", attemptIds).order("server_received_at", { ascending: false }).limit(1000) : ok([]),
  ]);
  if (assessmentError) throw assessmentError;
  if (profileError) throw profileError;
  if (slotError) throw slotError;
  if (queueError) throw queueError;
  if (incidentError) throw incidentError;
  if (eventError) throw eventError;

  const assessmentById = new Map((assessments ?? []).map((assessment) => [assessment.id, assessment]));
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const slotsByAttempt = groupBy((slots ?? []) as UploadSlot[], "attempt_id");
  const incidentsByAttempt = groupBy((incidents ?? []) as StudentIncidentReport[], "attempt_id");
  const eventsByAttempt = groupBy((events ?? []) as AttemptEvent[], "attempt_id");
  const queueEventsBySlot = groupBy((queueEvents ?? []) as UploadQueueEvent[], "upload_slot_id");
  const now = new Date().toISOString();

  return attempts.map((attempt) => {
    const attemptSlots = slotsByAttempt.get(attempt.id) ?? [];
    const moderationEvents = (eventsByAttempt.get(attempt.id) ?? []).filter((event) =>
      /fullscreen|visibility|blur|focus|offline|heartbeat|seb|incident/i.test(event.event_type),
    );
    const failedQueueEvents = attemptSlots.reduce((count, slot) => {
      return count + (queueEventsBySlot.get(slot.id) ?? []).filter((event) => event.event_type === "failed").length;
    }, 0);
    return {
      attempt,
      assessment: assessmentById.get(attempt.assessment_id) ?? null,
      student: attempt.assignee_profile_id ? profileById.get(attempt.assignee_profile_id) ?? null : null,
      state: computeAttemptState({
        serverNowUtc: now,
        startAtUtc: attempt.start_at_utc,
        endAtUtc: attempt.end_at_utc,
        uploadDeadlineAtUtc: attempt.upload_deadline_at_utc,
        pausedAtUtc: attempt.paused_at,
        solutionsRequested: attempt.solutions_requested,
      }),
      uploadSummary: {
        total: attemptSlots.length,
        uploaded: attemptSlots.filter((slot) => slot.status === "uploaded").length,
        missing: attemptSlots.filter((slot) => slot.status === "pending" || slot.status === "missing").length,
        failedQueueEvents,
      },
      incidents: (incidentsByAttempt.get(attempt.id) ?? []).length,
      moderationEvents: moderationEvents.length,
      lastEventAt: (eventsByAttempt.get(attempt.id) ?? [])[0]?.server_received_at ?? null,
    };
  });
}

async function buildSupportRows(attempts: Attempt[]): Promise<StudentSupportRow[]> {
  const boardRows = await buildOperationsRows(attempts);
  const supabase = await createSupabaseServerClient();
  const attemptIds = attempts.map((attempt) => attempt.id);
  const [{ data: slots, error: slotError }, { data: incidents, error: incidentError }, { data: queueEvents, error: queueError }, { data: releases, error: releaseError }] = await Promise.all([
    attemptIds.length ? supabase.from("upload_slots").select("*").in("attempt_id", attemptIds).order("created_at") : ok([]),
    attemptIds.length ? supabase.from("student_incident_reports").select("*").in("attempt_id", attemptIds).order("created_at", { ascending: false }) : ok([]),
    supabase.from("upload_queue_events").select("*").order("created_at", { ascending: false }).limit(500),
    attemptIds.length ? supabase.from("feedback_releases").select("*").in("attempt_id", attemptIds).is("revoked_at", null) : ok([]),
  ]);
  if (slotError) throw slotError;
  if (incidentError) throw incidentError;
  if (queueError) throw queueError;
  if (releaseError) throw releaseError;
  const slotsByAttempt = groupBy((slots ?? []) as UploadSlot[], "attempt_id");
  const incidentsByAttempt = groupBy((incidents ?? []) as StudentIncidentReport[], "attempt_id");
  const queueBySlot = groupBy((queueEvents ?? []) as UploadQueueEvent[], "upload_slot_id");
  const releaseByAttempt = new Map(((releases ?? []) as FeedbackRelease[]).map((release) => [release.attempt_id, release]));
  return boardRows.map((row) => {
    const attemptSlots = slotsByAttempt.get(row.attempt.id) ?? [];
    return {
      attempt: row.attempt,
      assessment: row.assessment,
      student: row.student,
      state: row.state,
      slots: attemptSlots,
      incidents: incidentsByAttempt.get(row.attempt.id) ?? [],
      queueEvents: attemptSlots.flatMap((slot) => queueBySlot.get(slot.id) ?? []),
      feedbackRelease: releaseByAttempt.get(row.attempt.id) ?? null,
    };
  });
}

function groupBy<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const value = String(row[key] ?? "");
    if (!value) continue;
    const current = grouped.get(value) ?? [];
    current.push(row);
    grouped.set(value, current);
  }
  return grouped;
}

function ok<T>(data: T) {
  return Promise.resolve({ data, error: null });
}

export function safeJsonObject(value: FormDataEntryValue | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(String(value)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? null)) as Json;
}
