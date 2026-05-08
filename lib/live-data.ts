import { computeAttemptState, getCountdownTarget } from "@/lib/attempt-state";
import { loadAssessmentPackage } from "@/lib/package-loader";
import { normalizedPackageSchema, type NormalizedAssessmentPackage } from "@/lib/assessment-package";
import type { AttemptState } from "@/lib/constants";
import { attemptWithState, sampleAssessment, sampleAttempts, samplePackage, sampleStudents } from "@/lib/demo-data";
import { isDemoModeEnabled } from "@/lib/runtime";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Assessment,
  AssessmentVersion,
  Attempt,
  FeedbackRelease,
  Mark,
  ModerationReport,
  ParseJob,
  ParseJobArtifact,
  Profile,
  QuestionNodeRow,
  SubmissionAnnotation,
  StudentCredential,
  StudentGroup,
  StudentGroupMember,
  TextResponse,
  UploadSlot,
} from "@/types/database";

export type StudentSummary = {
  id: string;
  display_name: string;
  login_code: string;
  activated_at: string | null;
};

export type StudentGroupSummary = {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  members: { id: string; display_name: string }[];
};

export type AssessmentSummary = {
  id: string;
  title: string;
  paper_code: string | null;
  assessment_kind: string;
  created_at: string;
  latest_version_id: string | null;
  latest_status: string | null;
  parse_confidence: number | null;
  requires_owner_review: boolean | null;
};

export type AttemptSummary = {
  id: string;
  title: string;
  paper_code: string | null;
  student: string;
  start_at_utc: string;
  end_at_utc: string;
  upload_deadline_at_utc: string | null;
  duration_seconds: number;
  display_timezone: string;
  solutions_requested: boolean;
  delivery_mode: string;
  state: AttemptState;
  countdown_target_utc: string | null;
  server_now_utc: string;
};

export type AssessmentWorkspace = {
  assessment: Assessment;
  versions: AssessmentVersion[];
  latestVersion: AssessmentVersion | null;
  questionNodes: QuestionNodeRow[];
  parseJobs: ParseJob[];
  parseArtifacts: ParseJobArtifact[];
};

export type AttemptReviewWorkspace = {
  attempt: AttemptSummary | null;
  questionNodes: QuestionNodeRow[];
  uploadSlots: UploadSlot[];
  textResponses: TextResponse[];
  moderationReport: ModerationReport | null;
  package: NormalizedAssessmentPackage | null;
  marks: Mark[];
  annotations: SubmissionAnnotation[];
  feedbackRelease: FeedbackRelease | null;
};

function demoAssessmentSummary(): AssessmentSummary {
  return {
    id: sampleAssessment.id,
    title: sampleAssessment.title,
    paper_code: sampleAssessment.paper_code ?? null,
    assessment_kind: sampleAssessment.assessment_kind,
    created_at: sampleAssessment.created_at,
    latest_version_id: "demo_version",
    latest_status: sampleAssessment.status,
    parse_confidence: sampleAssessment.parse_confidence,
    requires_owner_review: false,
  };
}

function demoAttemptSummaries(): AttemptSummary[] {
  return sampleAttempts.map((attempt) => {
    const withState = attemptWithState(attempt.id);
    return {
      id: attempt.id,
      title: attempt.title,
      paper_code: attempt.paper_code ?? null,
      student: attempt.student,
      start_at_utc: attempt.start_at_utc,
      end_at_utc: attempt.end_at_utc,
      upload_deadline_at_utc: attempt.upload_deadline_at_utc,
      duration_seconds: attempt.duration_seconds,
      display_timezone: attempt.display_timezone,
      solutions_requested: attempt.solutions_requested,
      delivery_mode: attempt.delivery_mode,
      state: withState.state,
      countdown_target_utc: withState.countdown_target_utc,
      server_now_utc: withState.server_now_utc,
    };
  });
}

function mapAttemptSummary(
  attempt: Attempt,
  assessmentById: Map<string, Assessment>,
  profileById: Map<string, Profile>,
): AttemptSummary {
  const serverNowUtc = new Date().toISOString();
  const state = computeAttemptState({
    serverNowUtc,
    startAtUtc: attempt.start_at_utc,
    endAtUtc: attempt.end_at_utc,
    uploadDeadlineAtUtc: attempt.upload_deadline_at_utc,
    solutionsRequested: attempt.solutions_requested,
  });
  const assessment = assessmentById.get(attempt.assessment_id);
  return {
    id: attempt.id,
    title: assessment?.title ?? "Untitled assessment",
    paper_code: assessment?.paper_code ?? null,
    student: profileById.get(attempt.assignee_profile_id)?.display_name ?? "Student",
    start_at_utc: attempt.start_at_utc,
    end_at_utc: attempt.end_at_utc,
    upload_deadline_at_utc: attempt.upload_deadline_at_utc,
    duration_seconds: attempt.duration_seconds,
    display_timezone: attempt.display_timezone,
    solutions_requested: attempt.solutions_requested,
    delivery_mode: attempt.delivery_mode,
    state,
    countdown_target_utc: getCountdownTarget(state, {
      startAtUtc: attempt.start_at_utc,
      endAtUtc: attempt.end_at_utc,
      uploadDeadlineAtUtc: attempt.upload_deadline_at_utc,
    }),
    server_now_utc: serverNowUtc,
  };
}

export async function listOwnerStudents(): Promise<StudentSummary[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("app_role", "student")
      .order("created_at", { ascending: false });
    if (profileError) throw profileError;

    const ids = (profiles ?? []).map((profile) => profile.id);
    const credentialByStudentId = new Map<string, StudentCredential>();
    if (ids.length > 0) {
      const { data: credentials, error: credentialError } = await supabase
        .from("student_credentials")
        .select("*")
        .in("student_profile_id", ids);
      if (credentialError) throw credentialError;
      for (const credential of credentials ?? []) credentialByStudentId.set(credential.student_profile_id, credential);
    }

    return (profiles ?? []).map((profile) => {
      const credential = credentialByStudentId.get(profile.id);
      return {
        id: profile.id,
        display_name: profile.display_name,
        login_code: credential?.login_code ?? "pending",
        activated_at: credential?.activated_at ?? null,
      };
    });
  } catch (error) {
    if (isDemoModeEnabled()) return [...sampleStudents];
    throw error;
  }
}

export async function listOwnerStudentGroups(): Promise<StudentGroupSummary[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: groups, error: groupError } = await supabase
      .from("student_groups")
      .select("*")
      .order("created_at", { ascending: false });
    if (groupError) throw groupError;

    const groupIds = (groups ?? []).map((group) => group.id);
    const membersByGroup = new Map<string, StudentGroupMember[]>();
    const profileIds = new Set<string>();
    if (groupIds.length > 0) {
      const { data: members, error: memberError } = await supabase
        .from("student_group_members")
        .select("*")
        .in("group_id", groupIds);
      if (memberError) throw memberError;
      for (const member of members ?? []) {
        profileIds.add(member.student_profile_id);
        const existing = membersByGroup.get(member.group_id) ?? [];
        existing.push(member);
        membersByGroup.set(member.group_id, existing);
      }
    }

    const profileById = new Map<string, Profile>();
    if (profileIds.size > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .in("id", [...profileIds]);
      if (profileError) throw profileError;
      for (const profile of profiles ?? []) profileById.set(profile.id, profile);
    }

    return (groups ?? []).map((group: StudentGroup) => {
      const members = membersByGroup.get(group.id) ?? [];
      return {
        id: group.id,
        name: group.name,
        description: group.description,
        member_count: members.length,
        members: members.map((member) => ({
          id: member.student_profile_id,
          display_name: profileById.get(member.student_profile_id)?.display_name ?? "Student",
        })),
      };
    });
  } catch (error) {
    if (isDemoModeEnabled()) return [];
    throw error;
  }
}

export async function listOwnerAssessments(): Promise<AssessmentSummary[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: assessments, error: assessmentError } = await supabase
      .from("assessments")
      .select("*")
      .order("created_at", { ascending: false });
    if (assessmentError) throw assessmentError;

    const ids = (assessments ?? []).map((assessment) => assessment.id);
    const versionsByAssessmentId = new Map<string, AssessmentVersion[]>();
    if (ids.length > 0) {
      const { data: versions, error: versionError } = await supabase
        .from("assessment_versions")
        .select("*")
        .in("assessment_id", ids)
        .order("version_no", { ascending: false });
      if (versionError) throw versionError;
      for (const version of versions ?? []) {
        const existing = versionsByAssessmentId.get(version.assessment_id) ?? [];
        existing.push(version);
        versionsByAssessmentId.set(version.assessment_id, existing);
      }
    }

    return (assessments ?? []).map((assessment) => {
      const latest = versionsByAssessmentId.get(assessment.id)?.[0] ?? null;
      return {
        id: assessment.id,
        title: assessment.title,
        paper_code: assessment.paper_code,
        assessment_kind: assessment.assessment_kind,
        created_at: assessment.created_at,
        latest_version_id: latest?.id ?? null,
        latest_status: latest?.status ?? null,
        parse_confidence: latest?.parse_confidence ?? null,
        requires_owner_review: latest?.requires_owner_review ?? null,
      };
    });
  } catch (error) {
    if (isDemoModeEnabled()) return [demoAssessmentSummary()];
    throw error;
  }
}

export async function getAssessmentWorkspace(assessmentId: string): Promise<AssessmentWorkspace | null> {
  if (isDemoModeEnabled() && assessmentId === sampleAssessment.id) {
    return {
      assessment: {
        id: sampleAssessment.id,
        owner_profile_id: "demo_owner",
        title: sampleAssessment.title,
        paper_code: sampleAssessment.paper_code ?? null,
        external_schedule_ref: null,
        assessment_kind: sampleAssessment.assessment_kind,
        description: null,
        default_timezone: "Africa/Johannesburg",
        created_at: sampleAssessment.created_at,
        updated_at: sampleAssessment.created_at,
      },
      versions: [
        {
          id: "demo_version",
          assessment_id: sampleAssessment.id,
          version_no: 1,
          status: "draft",
          source_kind: "json",
          source_object_path: null,
          normalized_package_path: null,
          normalized_package_json: samplePackage,
          encrypted_package_path: null,
          kms_provider: null,
          wrapped_data_key: null,
          encryption_metadata_json: {},
          parse_confidence: sampleAssessment.parse_confidence,
          requires_owner_review: false,
          published_at: null,
          created_at: sampleAssessment.created_at,
        },
      ],
      latestVersion: {
        id: "demo_version",
        assessment_id: sampleAssessment.id,
        version_no: 1,
        status: "draft",
        source_kind: "json",
        source_object_path: null,
        normalized_package_path: null,
        normalized_package_json: samplePackage,
        encrypted_package_path: null,
        kms_provider: null,
        wrapped_data_key: null,
        encryption_metadata_json: {},
        parse_confidence: sampleAssessment.parse_confidence,
        requires_owner_review: false,
        published_at: null,
        created_at: sampleAssessment.created_at,
      },
      questionNodes: samplePackage.questions.map((node) => ({
        id: node.node_id,
        assessment_version_id: "demo_version",
        parent_node_id: null,
        node_key: node.node_key,
        ordinal: node.ordinal,
        node_type: node.node_type,
        title: node.title ?? null,
        prompt_html: node.prompt?.html ?? null,
        prompt_latex: node.prompt?.latex ?? null,
        marks: node.marks ?? null,
        response_mode: node.response_mode,
        interaction_json: node.interaction ?? null,
        source_page_start: null,
        source_page_end: null,
        created_at: sampleAssessment.created_at,
      })),
      parseJobs: [],
      parseArtifacts: [],
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: assessment, error: assessmentError } = await supabase
    .from("assessments")
    .select("*")
    .eq("id", assessmentId)
    .maybeSingle();
  if (assessmentError) throw assessmentError;
  if (!assessment) return null;

  const { data: versions, error: versionError } = await supabase
    .from("assessment_versions")
    .select("*")
    .eq("assessment_id", assessmentId)
    .order("version_no", { ascending: false });
  if (versionError) throw versionError;

  const latestVersion = versions?.[0] ?? null;
  const { data: questionNodes, error: nodeError } = latestVersion
    ? await supabase
        .from("question_nodes")
        .select("*")
        .eq("assessment_version_id", latestVersion.id)
        .order("ordinal", { ascending: true })
    : { data: [], error: null };
  if (nodeError) throw nodeError;

  const { data: parseJobs, error: parseJobError } = latestVersion
    ? await supabase
        .from("parse_jobs")
        .select("*")
        .eq("assessment_version_id", latestVersion.id)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (parseJobError) throw parseJobError;

  const parseJobIds = (parseJobs ?? []).map((job) => job.id);
  const { data: parseArtifacts, error: artifactError } = parseJobIds.length
    ? await supabase
        .from("parse_job_artifacts")
        .select("*")
        .in("parse_job_id", parseJobIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (artifactError) throw artifactError;

  return {
    assessment,
    versions: versions ?? [],
    latestVersion,
    questionNodes: questionNodes ?? [],
    parseJobs: parseJobs ?? [],
    parseArtifacts: parseArtifacts ?? [],
  };
}

export async function listOwnerAttempts(): Promise<AttemptSummary[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: attempts, error: attemptError } = await supabase
      .from("attempts")
      .select("*")
      .order("start_at_utc", { ascending: false });
    if (attemptError) throw attemptError;

    return mapAttemptCollections(attempts ?? []);
  } catch (error) {
    if (isDemoModeEnabled()) return demoAttemptSummaries();
    throw error;
  }
}

export async function listStudentAttempts(): Promise<AttemptSummary[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: attempts, error: attemptError } = await supabase
      .from("attempts")
      .select("*")
      .order("start_at_utc", { ascending: false });
    if (attemptError) throw attemptError;

    return mapAttemptCollections(attempts ?? []);
  } catch (error) {
    if (isDemoModeEnabled()) return demoAttemptSummaries();
    throw error;
  }
}

async function mapAttemptCollections(attempts: Attempt[]): Promise<AttemptSummary[]> {
  const supabase = await createSupabaseServerClient();
  const assessmentIds = [...new Set(attempts.map((attempt) => attempt.assessment_id))];
  const profileIds = [...new Set(attempts.map((attempt) => attempt.assignee_profile_id))];
  const assessmentById = new Map<string, Assessment>();
  const profileById = new Map<string, Profile>();

  if (assessmentIds.length > 0) {
    const { data: assessments, error } = await supabase.from("assessments").select("*").in("id", assessmentIds);
    if (error) throw error;
    for (const assessment of assessments ?? []) assessmentById.set(assessment.id, assessment);
  }

  if (profileIds.length > 0) {
    const { data: profiles, error } = await supabase.from("profiles").select("*").in("id", profileIds);
    if (error) throw error;
    for (const profile of profiles ?? []) profileById.set(profile.id, profile);
  }

  return attempts.map((attempt) => mapAttemptSummary(attempt, assessmentById, profileById));
}


export async function getOwnerAttemptReviewWorkspace(attemptId: string): Promise<AttemptReviewWorkspace> {
  if (isDemoModeEnabled() && attemptId.startsWith("att_")) {
    const attempt = demoAttemptSummaries().find((item) => item.id === attemptId) ?? null;
    return {
      attempt,
      questionNodes: [],
      uploadSlots: [],
      textResponses: [],
      moderationReport: null,
      package: samplePackage,
      marks: [],
      annotations: [],
      feedbackRelease: null,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: attemptRow, error: attemptError } = await supabase.from("attempts").select("*").eq("id", attemptId).maybeSingle();
  if (attemptError) throw attemptError;
  if (!attemptRow) {
    return { attempt: null, questionNodes: [], uploadSlots: [], textResponses: [], moderationReport: null, package: null, marks: [], annotations: [], feedbackRelease: null };
  }

  const [attempt] = await mapAttemptCollections([attemptRow]);
  const [
    { data: questionNodes, error: nodeError },
    { data: uploadSlots, error: slotError },
    { data: textResponses, error: responseError },
    { data: moderationReport, error: reportError },
    { data: version, error: versionError },
    { data: marks, error: marksError },
    { data: annotations, error: annotationsError },
    { data: feedbackRelease, error: feedbackError },
  ] = await Promise.all([
    supabase
      .from("question_nodes")
      .select("*")
      .eq("assessment_version_id", attemptRow.assessment_version_id)
      .order("ordinal", { ascending: true }),
    supabase.from("upload_slots").select("*").eq("attempt_id", attemptId).order("created_at", { ascending: true }),
    supabase.from("text_responses").select("*").eq("attempt_id", attemptId).order("saved_at", { ascending: true }),
    supabase.from("moderation_reports").select("*").eq("attempt_id", attemptId).maybeSingle(),
    supabase.from("assessment_versions").select("*").eq("id", attemptRow.assessment_version_id).maybeSingle(),
    supabase.from("marks").select("*").eq("attempt_id", attemptId).order("created_at", { ascending: true }),
    supabase.from("submission_annotations").select("*").eq("attempt_id", attemptId).order("created_at", { ascending: true }),
    supabase.from("feedback_releases").select("*").eq("attempt_id", attemptId).maybeSingle(),
  ]);
  if (nodeError) throw nodeError;
  if (slotError) throw slotError;
  if (responseError) throw responseError;
  if (reportError) throw reportError;
  if (versionError) throw versionError;
  if (marksError) throw marksError;
  if (annotationsError) throw annotationsError;
  if (feedbackError) throw feedbackError;

  return {
    attempt,
    questionNodes: questionNodes ?? [],
    uploadSlots: uploadSlots ?? [],
    textResponses: textResponses ?? [],
    moderationReport: moderationReport ?? null,
    package: await loadAssessmentPackage(version ?? {}),
    marks: marks ?? [],
    annotations: annotations ?? [],
    feedbackRelease: feedbackRelease ?? null,
  };
}
