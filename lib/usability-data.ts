import { computeAttemptState } from "@/lib/attempt-state";
import { isDemoModeEnabled } from "@/lib/runtime";
import { buildModerationTimeline } from "@/lib/moderation-timeline";
import { classifyMarkingQueueRow, type MarkingQueueRow } from "@/lib/marking-queue";
import { computePaperHealth } from "@/lib/paper-health";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Assessment,
  AssessmentHealthCheck,
  AssessmentTemplate,
  AssessmentVersion,
  Attempt,
  AttemptAccommodation,
  AttemptEvent,
  AttemptIncident,
  AttemptRecoveryAction,
  CalendarRecommendation,
  Cohort,
  CohortMember,
  CommentBankItem,
  CorrectionEntry,
  CorrectionNotebook,
  FeedbackRelease,
  GeneratedPaper,
  GeneratedPaperItem,
  Mark,
  MarkschemeDocument,
  MarkschemeNode,
  MistakeCategory,
  MistakeInstance,
  Profile,
  QuestionBankChild,
  QuestionBankItem,
  QuestionNodeRow,
  QuestionSourceRegion,
  SubmissionReceipt,
  SourceDocument,
  TextResponse,
  TopicTag,
  UploadSanityCheck,
  UploadSlot,
} from "@/types/database";

export async function listMarkingQueue() {
  if (isDemoModeEnabled()) {
    return [
      {
        attempt_id: "att_active",
        assessment_id: "demo_assessment",
        assessment_title: "Olympiad Mock Paper 1",
        paper_code: "MATH-MOCK-01",
        student_name: "Owner practice persona",
        missing_upload_slots: 0,
        uploaded_slots: 2,
        total_upload_slots: 2,
        mark_count: 2,
        markable_leaf_count: 3,
        feedback_released: false,
        moderation_severity: "none",
        incident_affected: false,
        sections: ["partially_marked"],
      },
      {
        attempt_id: "att_waiting",
        assessment_id: "demo_assessment_2",
        assessment_title: "IB-style Physics Paper 2",
        paper_code: "PHY-HL-P2",
        student_name: "Naledi Mokoena",
        missing_upload_slots: 1,
        uploaded_slots: 0,
        total_upload_slots: 1,
        mark_count: 0,
        markable_leaf_count: 5,
        feedback_released: false,
        moderation_severity: "none",
        incident_affected: false,
        sections: ["missing_uploads"],
      },
    ];
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("owner_marking_queue").select("*").order("last_updated_at", { ascending: false });
  if (error) throw error;
  const queueRows = (data ?? []) as unknown as Array<MarkingQueueRow & Record<string, unknown>>;
  const assessmentIds = [...new Set(queueRows.map((row) => String(row.assessment_id)))];
  let gradingPolicies: { assessment_id: string; anonymous_grading: boolean }[] = [];
  if (assessmentIds.length) {
    const { data: policyRows, error: policyError } = await supabase
      .from("assessment_grading_policies")
      .select("assessment_id,anonymous_grading")
      .in("assessment_id", assessmentIds);
    if (policyError) throw policyError;
    gradingPolicies = policyRows ?? [];
  }
  const anonymousAssessmentIds = new Set(gradingPolicies.filter((policy) => policy.anonymous_grading).map((policy) => policy.assessment_id));
  return queueRows.map((typed) => {
    return {
      ...typed,
      student_name: typed.assessment_id && anonymousAssessmentIds.has(typed.assessment_id) ? `Anonymous script ${typed.attempt_id.slice(0, 8).toUpperCase()}` : typed.student_name,
      anonymous_grading: Boolean(typed.assessment_id && anonymousAssessmentIds.has(typed.assessment_id)),
      sections: classifyMarkingQueueRow(typed),
    };
  });
}

export async function listFeedbackReleaseControlRows() {
  if (isDemoModeEnabled()) {
    return [
      {
        attempt: {
          id: "att_finished",
          assessment_id: "demo_assessment",
          assignee_profile_id: "student_1",
          start_at_utc: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
          end_at_utc: new Date(Date.now() - 2 * 24 * 3600 * 1000 + 7200 * 1000).toISOString(),
          display_timezone: "Africa/Johannesburg",
          delivery_mode: "browser",
          solutions_requested: true,
          assessments: {
            title: "Quiz: Number Theory",
            paper_code: "NT-Q2",
          },
          profiles: {
            display_name: "Naledi Mokoena",
          },
        } as unknown as Attempt,
        release: {
          id: "feedback_demo",
          attempt_id: "att_finished",
          released_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
          visible_to_student: true,
          total_awarded_marks: 8,
          total_available_marks: 10,
        } as unknown as FeedbackRelease,
      },
    ];
  }
  const supabase = await createSupabaseServerClient();
  const [{ data: attempts, error: attemptError }, { data: releases, error: releaseError }] = await Promise.all([
    supabase.from("attempts").select("*").order("created_at", { ascending: false }),
    supabase.from("feedback_releases").select("*"),
  ]);
  if (attemptError) throw attemptError;
  if (releaseError) throw releaseError;
  const assessmentIds = [...new Set((attempts ?? []).map((attempt) => attempt.assessment_id))];
  const profileIds = [...new Set((attempts ?? []).map((attempt) => attempt.assignee_profile_id).filter((id): id is string => Boolean(id)))];
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
      profiles: attempt.assignee_profile_id ? profileById.get(attempt.assignee_profile_id) ?? undefined : undefined,
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
  if (isDemoModeEnabled() && attemptId.startsWith("att_")) {
    return {
      attempt: {
        id: attemptId,
        assessment_id: "demo_assessment",
        assessment_version_id: "demo_version",
        assignee_profile_id: "student_1",
        start_at_utc: new Date(Date.now() - 3600 * 1000).toISOString(),
        duration_seconds: 3600,
        end_at_utc: new Date(Date.now() + 3600 * 1000).toISOString(),
        upload_deadline_at_utc: new Date(Date.now() + 7200 * 1000).toISOString(),
        display_timezone: "Africa/Johannesburg",
        delivery_mode: "browser",
        solutions_requested: true,
        typed_enabled: true,
        per_question_upload_enabled: true,
        require_blank_for_skipped: true,
        seb_browser_exam_key_hashes: [],
        seb_config_key_hashes: [],
        seb_config_path: null,
        state_cache: null,
        created_at: new Date(Date.now() - 7200 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 7200 * 1000).toISOString(),
        assessments: {
          title: "IB-style Physics Paper 2",
          paper_code: "PHY-P2",
        },
        profiles: {
          display_name: "Demo Student",
        },
      },
      slots: [],
      events: [],
      incidents: [],
      accommodations: [],
      actions: [],
    };
  }
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
        attempt.assignee_profile_id
          ? supabase.from("profiles").select("id,display_name").eq("id", attempt.assignee_profile_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
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
  if (isDemoModeEnabled() && attemptId.startsWith("att_")) {
    return {
      id: "receipt_demo",
      attempt_id: attemptId,
      receipt_json: {
        assessment_title: "IB-style Physics Paper 2",
        paper_code: "PHY-HL-P2",
        attempt_short_code: "DEMO-ATT",
        finalized_at: new Date(Date.now() - 300 * 1000).toISOString(),
        slots: [
          {
            question_node_id: "q1",
            status: "uploaded",
            file_name: "physics_paper2_q1.pdf",
            uploaded_at: new Date(Date.now() - 400 * 1000).toISOString(),
            page_count: 4,
            sanity_status: "accepted",
            warnings: [],
            file_hash: null,
          },
        ],
      },
      created_at: new Date(Date.now() - 300 * 1000).toISOString(),
    } satisfies SubmissionReceipt;
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("submission_receipts").select("*").eq("attempt_id", attemptId).maybeSingle();
  if (error) throw error;
  return data as SubmissionReceipt | null;
}

export async function getCrossMarkWorkspace(assessmentId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: attempts, error: attemptError }, { data: nodes, error: nodeError }] = await Promise.all([
    supabase.from("attempts").select("*").eq("assessment_id", assessmentId).order("created_at"),
    supabase.from("question_nodes").select("*").order("ordinal"),
  ]);
  if (attemptError) throw attemptError;
  if (nodeError) throw nodeError;
  const attemptIds = (attempts ?? []).map((attempt) => attempt.id);
  const [
    { data: marks, error: markError },
    { data: slots, error: slotError },
    { data: textResponses, error: textResponseError },
  ] = attemptIds.length
    ? await Promise.all([
        supabase.from("marks").select("*").in("attempt_id", attemptIds),
        supabase.from("upload_slots").select("*").in("attempt_id", attemptIds),
        supabase.from("text_responses").select("*").in("attempt_id", attemptIds),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (markError) throw markError;
  if (slotError) throw slotError;
  if (textResponseError) throw textResponseError;
  const versionIds = new Set((attempts ?? []).map((attempt) => attempt.assessment_version_id));
  const profileIds = [...new Set((attempts ?? []).map((attempt) => attempt.assignee_profile_id).filter((id): id is string => Boolean(id)))];
  const { data: profiles, error: profileError } = profileIds.length
    ? await supabase.from("profiles").select("id,display_name").in("id", profileIds)
    : { data: [], error: null };
  if (profileError) throw profileError;
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  return {
    attempts: (attempts ?? []).map((attempt) => ({
      ...(attempt as Attempt),
      profiles: attempt.assignee_profile_id ? profileById.get(attempt.assignee_profile_id) ?? undefined : undefined,
    })),
    questionNodes: ((nodes ?? []) as QuestionNodeRow[]).filter((node) => versionIds.has(node.assessment_version_id)),
    marks: (marks ?? []) as Mark[],
    uploadSlots: (slots ?? []) as UploadSlot[],
    textResponses: (textResponses ?? []) as TextResponse[],
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

export async function getAssessmentHealthWorkspace(assessmentId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: assessment, error: assessmentError }, { data: versions, error: versionError }, { data: savedChecks, error: checkError }] = await Promise.all([
    supabase.from("assessments").select("*").eq("id", assessmentId).maybeSingle(),
    supabase.from("assessment_versions").select("*").eq("assessment_id", assessmentId).order("version_no", { ascending: false }),
    supabase.from("assessment_health_checks").select("*").eq("assessment_id", assessmentId).order("last_checked_at", { ascending: false }),
  ]);
  if (assessmentError) throw assessmentError;
  if (versionError) throw versionError;
  if (checkError) throw checkError;
  const latestVersion = versions?.[0] ?? null;
  const [
    { data: questionNodes, error: nodeError },
    { data: markschemeNodes, error: markschemeError },
    { data: sourceDocuments, error: sourceDocumentError },
    { data: sourceRegions, error: sourceRegionError },
  ] = latestVersion
    ? await Promise.all([
        supabase.from("question_nodes").select("*").eq("assessment_version_id", latestVersion.id).order("ordinal"),
        supabase.from("markscheme_nodes").select("*"),
        supabase.from("source_documents").select("*").eq("assessment_version_id", latestVersion.id).order("created_at", { ascending: false }),
        supabase.from("question_source_regions").select("*").eq("assessment_version_id", latestVersion.id).order("created_at", { ascending: false }),
      ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  if (nodeError) throw nodeError;
  if (markschemeError) throw markschemeError;
  if (sourceDocumentError) throw sourceDocumentError;
  if (sourceRegionError) throw sourceRegionError;
  const summary = computePaperHealth({
    assessment: assessment as Assessment | null,
    version: latestVersion as AssessmentVersion | null,
    questionNodes: (questionNodes ?? []) as QuestionNodeRow[],
    markschemeNodes: (markschemeNodes ?? []) as MarkschemeNode[],
    sourceDocuments: (sourceDocuments ?? []) as SourceDocument[],
    sourceRegions: (sourceRegions ?? []) as QuestionSourceRegion[],
  });
  return {
    assessment: assessment as Assessment | null,
    latestVersion: latestVersion as AssessmentVersion | null,
    questionNodes: (questionNodes ?? []) as QuestionNodeRow[],
    sourceDocuments: (sourceDocuments ?? []) as SourceDocument[],
    sourceRegions: (sourceRegions ?? []) as QuestionSourceRegion[],
    savedChecks: (savedChecks ?? []) as AssessmentHealthCheck[],
    summary,
  };
}

export async function listMistakeTaxonomyWorkspace() {
  const supabase = await createSupabaseServerClient();
  const [{ data: categories, error: categoryError }, { data: instances, error: instanceError }] = await Promise.all([
    supabase.from("mistake_categories").select("*").order("name"),
    supabase.from("mistake_instances").select("*").order("created_at", { ascending: false }).limit(100),
  ]);
  if (categoryError) throw categoryError;
  if (instanceError) throw instanceError;
  return { categories: (categories ?? []) as MistakeCategory[], instances: (instances ?? []) as MistakeInstance[] };
}

export async function listQuestionBankWorkspace() {
  const supabase = await createSupabaseServerClient();
  const [{ data: items, error: itemError }, { data: children, error: childError }] = await Promise.all([
    supabase.from("question_bank_items").select("*").order("created_at", { ascending: false }),
    supabase.from("question_bank_children").select("*").order("created_at", { ascending: true }),
  ]);
  if (itemError) throw itemError;
  if (childError) throw childError;
  return { items: (items ?? []) as QuestionBankItem[], children: (children ?? []) as QuestionBankChild[] };
}

export async function getQuestionBankItemWorkspace(questionId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: item, error: itemError }, { data: children, error: childError }] = await Promise.all([
    supabase.from("question_bank_items").select("*").eq("id", questionId).maybeSingle(),
    supabase.from("question_bank_children").select("*").eq("question_bank_item_id", questionId).order("ordinal_path"),
  ]);
  if (itemError) throw itemError;
  if (childError) throw childError;
  return { item: item as QuestionBankItem | null, children: (children ?? []) as QuestionBankChild[] };
}

export async function listPaperGeneratorWorkspace() {
  const supabase = await createSupabaseServerClient();
  const [{ data: items, error: itemError }, { data: papers, error: paperError }, { data: paperItems, error: paperItemError }] = await Promise.all([
    supabase.from("question_bank_items").select("*").eq("do_not_reuse", false).order("created_at", { ascending: false }),
    supabase.from("generated_papers").select("*").order("created_at", { ascending: false }),
    supabase.from("generated_paper_items").select("*").order("ordinal"),
  ]);
  if (itemError) throw itemError;
  if (paperError) throw paperError;
  if (paperItemError) throw paperItemError;
  return {
    questionBankItems: (items ?? []) as QuestionBankItem[],
    generatedPapers: (papers ?? []) as GeneratedPaper[],
    generatedPaperItems: (paperItems ?? []) as GeneratedPaperItem[],
  };
}

export async function getCorrectionNotebookWorkspace(attemptId: string) {
  if (isDemoModeEnabled() && attemptId.startsWith("att_")) {
    return {
      attempt: {
        id: attemptId,
        assessment_id: "demo_assessment",
        assessment_version_id: "demo_version",
        assignee_profile_id: "student_1",
        start_at_utc: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
        duration_seconds: 3600,
        end_at_utc: new Date(Date.now() - 2 * 24 * 3600 * 1000 + 3600 * 1000).toISOString(),
        upload_deadline_at_utc: new Date(Date.now() - 2 * 24 * 3600 * 1000 + 7200 * 1000).toISOString(),
        display_timezone: "Africa/Johannesburg",
        delivery_mode: "browser",
        solutions_requested: true,
      },
      notebook: {
        id: "notebook_demo",
        attempt_id: attemptId,
        student_profile_id: "student_1",
        status: "in_progress",
        created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      },
      entries: [
        {
          id: "entry_demo_1",
          notebook_id: "notebook_demo",
          question_node_id: "q1",
          corrected_solution_html: "<p>The correct derivation utilizes the SUVAT equation v^2 = u^2 + 2as.</p>",
          reflection_text: "I initially forgot that gravity acts downwards, causing a sign error.",
          created_at: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
        },
      ],
      feedback: {
        total_awarded_marks: 8,
        total_available_marks: 10,
        summary_text: "Good attempt, but watch out for visual signs in mechanics.",
      },
      questionNodes: [
        {
          id: "q1",
          assessment_version_id: "demo_version",
          parent_node_id: null,
          node_key: "Q1",
          ordinal: 1,
          node_type: "question",
          title: "Mechanics Question",
          prompt_html: "<p>A ball is dropped from a height of 10m. Calculate its final velocity.</p>",
          prompt_latex: null,
          marks: 10,
          response_mode: "typed_or_upload",
          interaction_json: null,
          markscheme_html: null,
          assets: [],
          source_page_start: null,
          source_page_end: null,
          created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        },
      ],
    };
  }
  const supabase = await createSupabaseServerClient();
  const [{ data: attempt, error: attemptError }, { data: notebook, error: notebookError }] = await Promise.all([
    supabase.from("attempts").select("*").eq("id", attemptId).maybeSingle(),
    supabase.from("correction_notebooks").select("*").eq("attempt_id", attemptId).maybeSingle(),
  ]);
  if (attemptError) throw attemptError;
  if (notebookError) throw notebookError;
  const [{ data: entries, error: entryError }, { data: feedback, error: feedbackError }, { data: nodes, error: nodeError }] = await Promise.all([
    notebook ? supabase.from("correction_entries").select("*").eq("notebook_id", notebook.id).order("created_at") : Promise.resolve({ data: [], error: null }),
    supabase.from("feedback_releases").select("*").eq("attempt_id", attemptId).is("revoked_at", null).order("released_at", { ascending: false }).limit(1).maybeSingle(),
    attempt ? supabase.from("question_nodes").select("*").eq("assessment_version_id", attempt.assessment_version_id).order("ordinal") : Promise.resolve({ data: [], error: null }),
  ]);
  if (entryError) throw entryError;
  if (feedbackError) throw feedbackError;
  if (nodeError) throw nodeError;
  return {
    attempt: attempt as Attempt | null,
    notebook: notebook as CorrectionNotebook | null,
    entries: (entries ?? []) as CorrectionEntry[],
    feedback: feedback as FeedbackRelease | null,
    questionNodes: (nodes ?? []) as QuestionNodeRow[],
  };
}
