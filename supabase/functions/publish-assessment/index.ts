import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";

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
  seb_browser_exam_key_hashes?: string[];
  seb_config_key_hashes?: string[];
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireOwnerAal2(request);
    const body = await readJson<Body>(request);
    const assignedProfileIds = [...new Set(body.assigned_profile_ids ?? [])];
    const assignedGroupIds = [...new Set(body.assigned_group_ids ?? [])];
    if (!body.assessment_id || !body.version_id || !body.start_at_local || (!assignedProfileIds.length && !assignedGroupIds.length)) {
      return json({ error: "Missing publish fields" }, 400);
    }
    const ownerProfile = await profileForAuthUser(user.id);
    const { data: version, error: versionError } = await admin
      .from("assessment_versions")
      .select("*")
      .eq("id", body.version_id)
      .single();
    if (versionError) throw versionError;
    if (version.requires_owner_review) return json({ error: "Owner review is required before publish" }, 400);

    const { data: assessment, error: assessmentError } = await admin
      .from("assessments")
      .select("owner_profile_id")
      .eq("id", body.assessment_id)
      .single();
    if (assessmentError) throw assessmentError;
    if (assessment.owner_profile_id !== ownerProfile.id) return json({ error: "Forbidden" }, 403);

    const start = parseLocalTimeToUtc(body.start_at_local, body.display_timezone || "Africa/Johannesburg");
    const end = new Date(start.getTime() + body.duration_seconds * 1000);
    const uploadDeadline =
      body.solutions_requested && body.upload_only_grace_seconds
        ? new Date(end.getTime() + body.upload_only_grace_seconds * 1000).toISOString()
        : null;

    const { error: publishError } = await admin
      .from("assessment_versions")
      .update({ status: "published", published_at: new Date().toISOString() })
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
      seb_browser_exam_key_hashes: normalizeHashList(body.seb_browser_exam_key_hashes),
      seb_config_key_hashes: normalizeHashList(body.seb_config_key_hashes),
    };

    const assignmentRows = [
      ...assignedProfileIds.map((profileId) => ({
        owner_profile_id: ownerProfile.id,
        assessment_id: body.assessment_id,
        assessment_version_id: body.version_id,
        assignment_kind: "individual",
        student_profile_id: profileId,
        student_group_id: null,
        ...timing,
      })),
      ...assignedGroupIds.map((groupId) => ({
        owner_profile_id: ownerProfile.id,
        assessment_id: body.assessment_id,
        assessment_version_id: body.version_id,
        assignment_kind: "group",
        student_profile_id: null,
        student_group_id: groupId,
        ...timing,
      })),
    ];
    const { data: assignments, error: assignmentError } = await admin
      .from("assessment_assignments")
      .insert(assignmentRows)
      .select("*");
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
    await auditOwnerAction(ownerProfile.id, user.id, "assessment.published", "assessment_versions", body.version_id, {
      assessment_id: body.assessment_id,
      assigned_profile_count: assignedProfileIds.length,
      assigned_group_count: assignedGroupIds.length,
      created_attempt_count: attempts?.length ?? 0,
    });
    return json({ ok: true, attempt_ids: attempts?.map((attempt) => attempt.id) ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "publish-assessment failed";
    return json({ error: message }, statusForPublishError(message));
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

function statusForPublishError(message: string) {
  if (/MFA|AAL2|Owner role|Forbidden|bearer token/i.test(message)) return 403;
  if (/Missing|review is required|invalid/i.test(message)) return 400;
  return 500;
}
