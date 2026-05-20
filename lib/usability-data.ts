import { computeAttemptState } from "@/lib/attempt-state";
import { buildModerationTimeline } from "@/lib/moderation-timeline";
import { classifyMarkingQueueRow, type MarkingQueueRow } from "@/lib/marking-queue";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  AssessmentTemplate,
  Attempt,
  AttemptAccommodation,
  AttemptEvent,
  AttemptIncident,
  AttemptRecoveryAction,
  CalendarRecommendation,
  Cohort,
  CohortMember,
  CommentBankItem,
  FeedbackRelease,
  Mark,
  MarkschemeDocument,
  MarkschemeNode,
  Profile,
  QuestionNodeRow,
  SubmissionReceipt,
  TopicTag,
  UploadSanityCheck,
  UploadSlot,
} from "@/types/database";

export async function listMarkingQueue() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("owner_marking_queue").select("*").order("last_updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const typed = row as MarkingQueueRow & Record<string, unknown>;
    return { ...typed, sections: classifyMarkingQueueRow(typed) };
  });
}

export async function listFeedbackReleaseControlRows() {
  const supabase = await createSupabaseServerClient();
  const [{ data: attempts, error: attemptError }, { data: releases, error: releaseError }] = await Promise.all([
    supabase.from("attempts").select("*").order("created_at", { ascending: false }),
    supabase.from("feedback_releases").select("*"),
  ]);
  if (attemptError) throw attemptError;
  if (releaseError) throw releaseError;
  const assessmentIds = [...new Set((attempts ?? []).map((attempt) => attempt.assessment_id))];
  const profileIds = [...new Set((attempts ?? []).map((attempt) => attempt.assignee_profile_id))];
  const [{ data: assessments, error: assessmentError }, { data: profiles, error: profileError }] = await Promise.all([
    assessmentIds.length ? supabase.from("assessments").select("id,title,paper_code").in("id", assessmentIds) : Promise.resolve({ data: [], error: null }),
    profileIds.length ? supabase.from("profiles").select("id,display_name").in("id", profileIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (assessmentError) throw assessmentError;
  if (profileError) throw profileError;
  const assessmentById = new Map((assessments ?? []).map((assessment) => [assessment.id, assessment]));
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const releaseByAttempt = new Map((releases ?? []).map((release) => [release.attempt_id, release as FeedbackRelease]));
  return (attempts ?? []).map((attempt) => ({
    attempt: {
      ...(attempt as Attempt),
      assessments: assessmentById.get(attempt.assessment_id) ?? undefined,
      profiles: profileById.get(attempt.assignee_profile_id) ?? undefined,
    },
    release: releaseByAttempt.get(attempt.id) ?? null,
  }));
}

export async function listAssessmentTemplates() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("assessment_templates").select("*").order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AssessmentTemplate[];
}

export async function listCommentBankItems() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("comment_bank_items").select("*").order("usage_count", { ascending: false }).order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CommentBankItem[];
}

export async function listCohortsWithMembers() {
  const supabase = await createSupabaseServerClient();
  const [{ data: cohorts, error: cohortError }, { data: members, error: memberError }, { data: students, error: studentError }] = await Promise.all([
    supabase.from("cohorts").select("*").order("name"),
    supabase.from("cohort_members").select("*"),
    supabase.from("profiles").select("*").eq("app_role", "student").order("display_name"),
  ]);
  if (cohortError) throw cohortError;
  if (memberError) throw memberError;
  if (studentError) throw studentError;
  const studentById = new Map((students ?? []).map((student) => [student.id, student as Profile]));
  return {
    cohorts: (cohorts ?? []).map((cohort) => ({
      cohort: cohort as Cohort,
      members: (members ?? []).filter((member) => member.cohort_id === cohort.id).map((member) => ({
        member: member as CohortMember,
        student: studentById.get(member.student_profile_id) ?? null,
      })),
    })),
    students: (students ?? []) as Profile[],
  };
}

export async function getAttemptRecoveryWorkspace(attemptId: string) {
  const supabase = await createSupabaseServerClient();
  const [
    { data: attempt, error: attemptError },
    { data: slots, error: slotError },
    { data: events, error: eventError },
    { data: incidents, error: incidentError },
    { data: accommodations, error: accommodationError },
    { data: actions, error: actionError },
  ] = await Promise.all([
    supabase.from("attempts").select("*").eq("id", attemptId).maybeSingle(),
    supabase.from("upload_slots").select("*").eq("attempt_id", attemptId).order("created_at"),
    supabase.from("attempt_events").select("*").eq("attempt_id", attemptId).order("server_received_at"),
    supabase.from("attempt_incidents").select("*").eq("attempt_id", attemptId).order("created_at", { ascending: false }),
    supabase.from("attempt_accommodations").select("*").eq("attempt_id", attemptId).order("applied_at", { ascending: false }),
    supabase.from("attempt_recovery_actions").select("*").eq("attempt_id", attemptId).order("created_at", { ascending: false }),
  ]);
  if (attemptError) throw attemptError;
  if (slotError) throw slotError;
  if (eventError) throw eventError;
  if (incidentError) throw incidentError;
  if (accommodationError) throw accommodationError;
  if (actionError) throw actionError;
  const [{ data: assessment, error: assessmentError }, { data: profile, error: profileError }] = attempt
    ? await Promise.all([
        supabase.from("assessments").select("id,title,paper_code").eq("id", attempt.assessment_id).maybeSingle(),
        supabase.from("profiles").select("id,display_name").eq("id", attempt.assignee_profile_id).maybeSingle(),
      ])
    : [{ data: null, error: null }, { data: null, error: null }];
  if (assessmentError) throw assessmentError;
  if (profileError) throw profileError;
  return {
    attempt: attempt
      ? ({
          ...(attempt as Attempt),
          assessments: assessment ?? undefined,
          profiles: profile ?? undefined,
        } as Attempt & { assessments?: { title: string; paper_code: string | null }; profiles?: { display_name: string } })
      : null,
    slots: (slots ?? []) as UploadSlot[],
    events: (events ?? []) as AttemptEvent[],
    incidents: (incidents ?? []) as AttemptIncident[],
    accommodations: (accommodations ?? []) as AttemptAccommodation[],
    actions: (actions ?? []) as AttemptRecoveryAction[],
  };
}

export async function getSubmissionReceipt(attemptId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("submission_receipts").select("*").eq("attempt_id", attemptId).maybeSingle();
  if (error) throw error;
  return data as SubmissionReceipt | null;
}

export async function getCrossMarkWorkspace(assessmentId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: attempts, error: attemptError }, { data: nodes, error: nodeError }, { data: marks, error: markError }, { data: slots, error: slotError }] = await Promise.all([
    supabase.from("attempts").select("*").eq("assessment_id", assessmentId).order("created_at"),
    supabase.from("question_nodes").select("*").order("ordinal"),
    supabase.from("marks").select("*"),
    supabase.from("upload_slots").select("*"),
  ]);
  if (attemptError) throw attemptError;
  if (nodeError) throw nodeError;
  if (markError) throw markError;
  if (slotError) throw slotError;
  const versionIds = new Set((attempts ?? []).map((attempt) => attempt.assessment_version_id));
  const profileIds = [...new Set((attempts ?? []).map((attempt) => attempt.assignee_profile_id))];
  const { data: profiles, error: profileError } = profileIds.length
    ? await supabase.from("profiles").select("id,display_name").in("id", profileIds)
    : { data: [], error: null };
  if (profileError) throw profileError;
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  return {
    attempts: (attempts ?? []).map((attempt) => ({
      ...(attempt as Attempt),
      profiles: profileById.get(attempt.assignee_profile_id) ?? undefined,
    })),
    questionNodes: ((nodes ?? []) as QuestionNodeRow[]).filter((node) => versionIds.has(node.assessment_version_id)),
    marks: (marks ?? []) as Mark[],
    uploadSlots: (slots ?? []) as UploadSlot[],
  };
}

export async function listTopicDashboard() {
  const supabase = await createSupabaseServerClient();
  const [{ data: tags, error: tagError }, { data: recommendations, error: recommendationError }] = await Promise.all([
    supabase.from("topic_tags").select("*").order("subject").order("tag"),
    supabase.from("calendar_recommendations").select("*").order("created_at", { ascending: false }),
  ]);
  if (tagError) throw tagError;
  if (recommendationError) throw recommendationError;
  return { tags: (tags ?? []) as TopicTag[], recommendations: (recommendations ?? []) as CalendarRecommendation[] };
}

export async function getModerationTimelineWorkspace(attempt: Attempt, events: AttemptEvent[], incidents: AttemptIncident[], accommodations: AttemptAccommodation[]) {
  return buildModerationTimeline({ attempt, events, incidents, accommodations });
}

export async function getLatestUploadSanityBySlot(slotIds: string[]) {
  if (!slotIds.length) return new Map<string, UploadSanityCheck>();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("upload_sanity_checks").select("*").in("upload_slot_id", slotIds).order("created_at", { ascending: true });
  if (error) throw error;
  const latest = new Map<string, UploadSanityCheck>();
  for (const check of data ?? []) latest.set(check.upload_slot_id, check as UploadSanityCheck);
  return latest;
}

export function attemptStateForNow(attempt: Pick<Attempt, "start_at_utc" | "end_at_utc" | "upload_deadline_at_utc" | "solutions_requested">) {
  return computeAttemptState({
    serverNowUtc: new Date().toISOString(),
    startAtUtc: attempt.start_at_utc,
    endAtUtc: attempt.end_at_utc,
    uploadDeadlineAtUtc: attempt.upload_deadline_at_utc,
    solutionsRequested: attempt.solutions_requested,
  });
}

export async function listMarkschemeMappingWorkspace(assessmentVersionId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: documents, error: documentError }, { data: nodes, error: markschemeNodeError }, { data: questionNodes, error: questionError }] = await Promise.all([
    supabase.from("markscheme_documents").select("*").eq("assessment_version_id", assessmentVersionId).order("created_at", { ascending: false }),
    supabase.from("markscheme_nodes").select("*").order("created_at", { ascending: true }),
    supabase.from("question_nodes").select("*").eq("assessment_version_id", assessmentVersionId).order("ordinal"),
  ]);
  if (documentError) throw documentError;
  if (markschemeNodeError) throw markschemeNodeError;
  if (questionError) throw questionError;
  const documentIds = new Set((documents ?? []).map((document) => document.id));
  return {
    documents: (documents ?? []) as MarkschemeDocument[],
    markschemeNodes: ((nodes ?? []) as MarkschemeNode[]).filter((node) => documentIds.has(node.markscheme_document_id)),
    questionNodes: (questionNodes ?? []) as QuestionNodeRow[],
  };
}
