import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertInstitutionOwner, auditOwnerAction, requireInstitutionAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import { validatePublishHealth } from "../_shared/publish-health.ts";
import { validateSebPublishKeys } from "../_shared/seb.ts";
import { assertVersionMutable } from "../_shared/version-governance.ts";

type Body = {
  assessment_id: string;
  version_id: string;
  start_at_local: string;
  display_timezone: string;
  duration_seconds: number;
  delivery_mode: "browser" | "seb_required";
  solutions_requested: boolean;
  upload_only_grace_seconds?: number;
  assigned_profile_ids: string[];
  typed_enabled?: boolean;
  per_question_upload_enabled?: boolean;
  require_blank_for_skipped?: boolean;
  assigned_group_ids?: string[];
  assigned_cohort_ids?: string[];
  seb_browser_exam_key_hashes?: string[];
  seb_config_key_hashes?: string[];
  seb_config_path?: string;
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin, ownerProfileId } = await requireInstitutionAal2(request, "session_publishing");
    const body = await readJson<Body>(request);
    const assignedProfileIds = [...new Set(body.assigned_profile_ids ?? [])];
    const assignedGroupIds = [...new Set(body.assigned_group_ids ?? [])];
    const assignedCohortIds = [...new Set(body.assigned_cohort_ids ?? [])];
    if (!body.assessment_id || !body.version_id || !body.start_at_local || (!assignedProfileIds.length && !assignedGroupIds.length && !assignedCohortIds.length)) {
      return json(request, { error: "Missing publish fields" }, 400);
    }
    const sebBrowserExamKeys = normalizeHashList(body.seb_browser_exam_key_hashes);
    const sebConfigKeys = normalizeHashList(body.seb_config_key_hashes);
    const sebValidation = validateSebPublishKeys({
      deliveryMode: body.delivery_mode,
      browserExamKeys: sebBrowserExamKeys,
      configKeys: sebConfigKeys,
    });
    if (!sebValidation.ok) return json(request, { error: sebValidation.reason }, 400);

    const { data: version, error: versionError } = await admin
      .from("assessment_versions")
      .select("*,assessments!inner(owner_profile_id)")
      .eq("id", body.version_id)
      .eq("assessment_id", body.assessment_id)
      .single();
    if (versionError) throw versionError;
    const assessment = version.assessments as { owner_profile_id?: string } | null;
    assertInstitutionOwner(assessment?.owner_profile_id, ownerProfileId);
    assertVersionMutable(version.status);
    if (version.governance_status !== "approved") {
      return json(request, { error: "This version must be reviewed and approved before publish", code: "approval_required" }, 409);
    }
    if (version.requires_owner_review) return json(request, { error: "Owner review is required before publish" }, 400);

    const [{ data: questionNodes, error: questionError }, { data: sourceRegions, error: regionError }, { data: markschemeDocuments, error: markschemeDocumentError }] = await Promise.all([
      admin.from("question_nodes").select("id,node_key,node_type,marks,response_mode").eq("assessment_version_id", body.version_id),
      admin.from("question_source_regions").select("id,question_node_id,region_type,status,confidence,metadata_json").eq("assessment_version_id", body.version_id),
      admin.from("markscheme_documents").select("id").eq("assessment_version_id", body.version_id),
    ]);
    if (questionError) throw questionError;
    if (regionError) throw regionError;
    if (markschemeDocumentError) throw markschemeDocumentError;
    const markschemeDocumentIds = (markschemeDocuments ?? []).map((document) => document.id);
    const { data: markschemeNodes, error: markschemeError } = markschemeDocumentIds.length
      ? await admin.from("markscheme_nodes").select("status,mapped_question_node_id").in("markscheme_document_id", markschemeDocumentIds)
      : { data: [], error: null };
    if (markschemeError) throw markschemeError;
    const healthBlockers = validatePublishHealth({
      questionNodes: questionNodes ?? [],
      sourceRegions: sourceRegions ?? [],
      markschemeNodes: markschemeNodes ?? [],
    });
    if (healthBlockers.length) {
      return json(request, { error: "Publish health checks failed", code: "publish_health_blocked", blockers: healthBlockers }, 409);
    }

    if (assignedProfileIds.length) {
      const { data: linkedStudents, error: linkedStudentError } = await admin
        .from("owner_student_links")
        .select("student_profile_id")
        .eq("owner_profile_id", ownerProfileId)
        .in("student_profile_id", assignedProfileIds);
      if (linkedStudentError) throw linkedStudentError;
      const linkedIds = new Set((linkedStudents ?? []).map((link) => link.student_profile_id));
      if (assignedProfileIds.some((profileId) => !linkedIds.has(profileId))) {
        return json(request, { error: "One or more assigned students are outside this institution" }, 403);
      }
    }

    if (assignedGroupIds.length) {
      const { data: ownedGroups, error: groupError } = await admin
        .from("student_groups")
        .select("id")
        .eq("owner_profile_id", ownerProfileId)
        .in("id", assignedGroupIds);
      if (groupError) throw groupError;
      const ownedGroupIds = new Set((ownedGroups ?? []).map((group) => group.id));
      if (assignedGroupIds.some((groupId) => !ownedGroupIds.has(groupId))) {
        return json(request, { error: "One or more assigned groups are outside this institution" }, 403);
      }
    }

    const start = parseLocalTimeToUtc(body.start_at_local, body.display_timezone || "Africa/Johannesburg");
    const end = new Date(start.getTime() + body.duration_seconds * 1000);
    const uploadDeadline =
      body.solutions_requested && body.upload_only_grace_seconds
        ? new Date(end.getTime() + body.upload_only_grace_seconds * 1000).toISOString()
        : null;

    const { error: publishError } = await admin
      .from("assessment_versions")
      .update({ status: "published", governance_status: "published", published_at: new Date().toISOString() })
      .eq("id", body.version_id);
    if (publishError) throw publishError;

    const timing = {
      start_at_utc: start.toISOString(),
      duration_seconds: body.duration_seconds,
      end_at_utc: end.toISOString(),
      upload_deadline_at_utc: uploadDeadline,
      display_timezone: body.display_timezone || "Africa/Johannesburg",
      delivery_mode: body.delivery_mode,
      solutions_requested: body.solutions_requested,
      typed_enabled: body.typed_enabled ?? true,
      per_question_upload_enabled: body.per_question_upload_enabled ?? true,
      require_blank_for_skipped: body.require_blank_for_skipped ?? false,
      seb_browser_exam_key_hashes: sebBrowserExamKeys,
      seb_config_key_hashes: sebConfigKeys,
      seb_config_path: body.seb_config_path ?? null,
    };

    const assignmentRows = [
      ...assignedProfileIds.map((profileId) => ({
        owner_profile_id: ownerProfileId,
        assessment_id: body.assessment_id,
        assessment_version_id: body.version_id,
        assignment_kind: "individual",
        student_profile_id: profileId,
        student_group_id: null,
        ...timing,
      })),
      ...assignedGroupIds.map((groupId) => ({
        owner_profile_id: ownerProfileId,
        assessment_id: body.assessment_id,
        assessment_version_id: body.version_id,
        assignment_kind: "group",
        student_profile_id: null,
        student_group_id: groupId,
        ...timing,
      })),
    ];
    const { data: assignments, error: assignmentError } = assignmentRows.length
      ? await admin
          .from("assessment_assignments")
          .insert(assignmentRows)
          .select("*")
      : { data: [], error: null };
    if (assignmentError) throw assignmentError;

    const studentIds = new Set<string>(assignedProfileIds);
    for (const groupId of assignedGroupIds) {
      const { data: members, error: memberError } = await admin
        .from("student_group_members")
        .select("student_profile_id")
        .eq("group_id", groupId);
      if (memberError) throw memberError;
      for (const member of members ?? []) studentIds.add(member.student_profile_id);
    }
    for (const cohortId of assignedCohortIds) {
      const { data: cohort, error: cohortError } = await admin
        .from("cohorts")
        .select("owner_profile_id")
        .eq("id", cohortId)
        .single();
      if (cohortError) throw cohortError;
      if (cohort.owner_profile_id !== ownerProfileId) return json(request, { error: "Forbidden cohort assignment" }, 403);
      const { data: members, error: memberError } = await admin
        .from("cohort_members")
        .select("student_profile_id")
        .eq("cohort_id", cohortId);
      if (memberError) throw memberError;
      for (const member of members ?? []) studentIds.add(member.student_profile_id);
    }

    const assignmentByStudent = new Map<string, string | null>();
    for (const assignment of assignments ?? []) {
      if (assignment.student_profile_id) assignmentByStudent.set(assignment.student_profile_id, assignment.id);
    }
    const firstGroupAssignment = (assignments ?? []).find((assignment) => assignment.assignment_kind === "group")?.id ?? null;

    const rows = [...studentIds].map((profileId) => ({
      assessment_id: body.assessment_id,
      assessment_version_id: body.version_id,
      assessment_assignment_id: assignmentByStudent.get(profileId) ?? firstGroupAssignment,
      assignee_profile_id: profileId,
      ...timing,
    }));
    const { data: attempts, error: attemptError } = await admin.from("attempts").insert(rows).select("id");
    if (attemptError) throw attemptError;
    for (const attempt of attempts ?? []) {
      if (body.per_question_upload_enabled ?? true) {
        await admin.rpc("create_upload_slots_for_attempt", { target_attempt_id: attempt.id });
      }
    }
    await auditOwnerAction(ownerProfileId, user.id, "assessment.published", "assessment_versions", body.version_id, {
      assessment_id: body.assessment_id,
      assigned_profile_count: assignedProfileIds.length,
      assigned_group_count: assignedGroupIds.length,
      assigned_cohort_count: assignedCohortIds.length,
      created_attempt_count: attempts?.length ?? 0,
    });
    return json(request, { ok: true, attempt_ids: attempts?.map((attempt) => attempt.id) ?? [] });
  } catch (error) {
    return errorResponse(request, error, "publish-assessment failed");
  }
});

function normalizeHashList(values: string[] | undefined) {
  return [...new Set((values ?? []).flatMap((value) => value.split(/[\s,]+/)).map((value) => value.trim()).filter(Boolean))];
}

function parseLocalTimeToUtc(localTime: string, timezone: string): Date {
  const localDate = new Date(localTime + ":00Z");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  }).formatToParts(localDate);
  const offsetPart = parts.find((p) => p.type === "timeZoneName");
  if (!offsetPart) return localDate;
  const match = offsetPart.value.match(/GMT([+-])(\d+):?(\d+)?/);
  if (!match) return localDate;
  const sign = match[1] === "+" ? 1 : -1;
  const hours = parseInt(match[2], 10);
  const minutes = match[3] ? parseInt(match[3], 10) : 0;
  const offsetMinutes = sign * (hours * 60 + minutes);
  return new Date(localDate.getTime() - offsetMinutes * 60 * 1000);
}
