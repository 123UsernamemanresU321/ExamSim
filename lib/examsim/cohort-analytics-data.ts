import "server-only";
import { computeCohortAnalytics } from "@/lib/examsim/cohort-analytics";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function loadInstitutionCohortAnalytics(ownerProfileId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: cohorts, error: cohortError }, { data: assessments, error: assessmentError }] = await Promise.all([
    supabase.from("cohorts").select("id,name,owner_profile_id").eq("owner_profile_id", ownerProfileId).order("name"),
    supabase.from("assessments").select("id,title,owner_profile_id").eq("owner_profile_id", ownerProfileId),
  ]);
  if (cohortError) throw cohortError;
  if (assessmentError) throw assessmentError;
  const cohortIds = (cohorts ?? []).map((cohort) => cohort.id);
  const assessmentIds = (assessments ?? []).map((assessment) => assessment.id);
  const [{ data: members, error: memberError }, { data: attempts, error: attemptError }] = await Promise.all([
    cohortIds.length ? supabase.from("cohort_members").select("cohort_id,student_profile_id").in("cohort_id", cohortIds) : Promise.resolve({ data: [], error: null }),
    assessmentIds.length ? supabase.from("attempts").select("id,assessment_id,assessment_version_id,assignee_profile_id,state_cache,forced_submitted_at,end_at_utc").in("assessment_id", assessmentIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (memberError) throw memberError;
  if (attemptError) throw attemptError;
  const attemptIds = (attempts ?? []).map((attempt) => attempt.id);
  const versionIds = [...new Set((attempts ?? []).map((attempt) => attempt.assessment_version_id))];
  const [{ data: releases, error: releaseError }, { data: questions, error: questionError }] = await Promise.all([
    attemptIds.length ? supabase.from("feedback_releases").select("attempt_id,visible_to_student,revoked_at").in("attempt_id", attemptIds) : Promise.resolve({ data: [], error: null }),
    versionIds.length ? supabase.from("question_nodes").select("id,assessment_version_id,marks,parent_node_id").in("assessment_version_id", versionIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (releaseError) throw releaseError;
  if (questionError) throw questionError;
  const questionIds = (questions ?? []).map((question) => question.id);
  const [{ data: marks, error: markError }, { data: topicLinks, error: topicLinkError }, { data: standardLinks, error: standardLinkError }] = await Promise.all([
    attemptIds.length ? supabase.from("marks").select("attempt_id,question_node_id,awarded_marks").in("attempt_id", attemptIds) : Promise.resolve({ data: [], error: null }),
    questionIds.length ? supabase.from("question_topic_links").select("question_node_id,topic_tag_id").in("question_node_id", questionIds) : Promise.resolve({ data: [], error: null }),
    questionIds.length ? supabase.from("question_standard_links").select("question_node_id,curriculum_standard_id").in("question_node_id", questionIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (markError) throw markError;
  if (topicLinkError) throw topicLinkError;
  if (standardLinkError) throw standardLinkError;
  const topicIds = [...new Set((topicLinks ?? []).map((link) => link.topic_tag_id))];
  const standardIds = [...new Set((standardLinks ?? []).map((link) => link.curriculum_standard_id))];
  const [{ data: topics, error: topicError }, { data: standards, error: standardError }] = await Promise.all([
    topicIds.length ? supabase.from("topic_tags").select("id,tag").in("id", topicIds) : Promise.resolve({ data: [], error: null }),
    standardIds.length ? supabase.from("curriculum_standards").select("id,code,title").in("id", standardIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (topicError) throw topicError;
  if (standardError) throw standardError;
  const released = new Set((releases ?? []).filter((release) => release.visible_to_student && !release.revoked_at).map((release) => release.attempt_id));
  const topicById = new Map((topics ?? []).map((topic) => [topic.id, topic.tag]));
  const standardById = new Map((standards ?? []).map((standard) => [standard.id, `${standard.code} ${standard.title}`]));
  return computeCohortAnalytics({
    cohorts: (cohorts ?? []).map((cohort) => ({ id: cohort.id, name: cohort.name, memberIds: (members ?? []).filter((member) => member.cohort_id === cohort.id).map((member) => member.student_profile_id) })),
    attempts: (attempts ?? []).map((attempt) => ({ id: attempt.id, studentProfileId: attempt.assignee_profile_id, assessmentId: attempt.assessment_id, assessmentVersionId: attempt.assessment_version_id, state: attempt.state_cache ?? (attempt.forced_submitted_at || Date.parse(attempt.end_at_utc) <= Date.now() ? "FINISHED_REVIEW" : "ACTIVE"), released: released.has(attempt.id) })),
    questions: (questions ?? []).map((question) => ({ id: question.id, assessmentVersionId: question.assessment_version_id, marks: question.marks == null ? null : Number(question.marks), parentNodeId: question.parent_node_id })),
    marks: (marks ?? []).map((mark) => ({ attemptId: mark.attempt_id, questionNodeId: mark.question_node_id, awardedMarks: Number(mark.awarded_marks ?? 0) })),
    topicLinks: (topicLinks ?? []).map((link) => ({ questionNodeId: link.question_node_id, label: topicById.get(link.topic_tag_id) ?? "Unlabelled topic" })),
    standardLinks: (standardLinks ?? []).map((link) => ({ questionNodeId: link.question_node_id, label: standardById.get(link.curriculum_standard_id) ?? "Unlabelled standard" })),
    assessments: (assessments ?? []).map((assessment) => ({ id: assessment.id, title: assessment.title })),
  });
}
