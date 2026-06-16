import { computeAttemptState } from "@/lib/attempt-state";
import { getCurrentUserProfile } from "@/lib/auth/server";
import { isDemoModeEnabled } from "@/lib/runtime";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Assessment, AssessmentVersion, Attempt, AttemptEvent, ExamSession, InvigilationMessage, Profile, StudentRosterEntry, TextResponse, UploadSlot } from "@/types/database";

export type ExamSessionRow = ExamSession & {
  assessment_title: string;
  paper_code: string | null;
  subject: string | null;
  version_status: string | null;
  attempt_count: number;
};

export type SessionAssessmentOption = {
  assessment: Pick<Assessment, "id" | "title" | "paper_code" | "subject">;
  latestVersion: Pick<AssessmentVersion, "id" | "version_no" | "status"> | null;
};

export type LiveSessionAttempt = {
  attempt: Attempt;
  studentName: string;
  studentNumber: string | null;
  state: "WAITING" | "ACTIVE" | "UPLOAD_ONLY" | "FINISHED_REVIEW";
  uploadSlots: UploadSlot[];
  responseCount: number;
  currentQuestionKey: string | null;
  lastEventAt: string | null;
  lastEventType: string | null;
  heartbeatGapSeconds: number | null;
  technicalIssueCount: number;
};

export type ReconciliationCandidate = {
  attempt: Attempt;
  guestName: string;
  guestNumber: string | null;
  matchedRosterEntry: StudentRosterEntry | null;
};

export async function listOwnerExamSessions(): Promise<ExamSessionRow[]> {
  if (isDemoModeEnabled()) return [];
  const supabase = await createSupabaseServerClient();
  const { data: sessions, error } = await supabase
    .from("exam_sessions")
    .select("*, assessments(title,paper_code,subject), assessment_versions(status)")
    .order("start_at_utc", { ascending: false })
    .limit(80);
  if (error) throw error;

  const sessionIds = (sessions ?? []).map((session) => session.id);
  const attemptCountBySession = new Map<string, number>();
  if (sessionIds.length) {
    const { data: attempts, error: attemptError } = await supabase
      .from("attempts")
      .select("exam_session_id")
      .in("exam_session_id", sessionIds);
    if (attemptError) throw attemptError;
    for (const attempt of attempts ?? []) {
      if (!attempt.exam_session_id) continue;
      attemptCountBySession.set(attempt.exam_session_id, (attemptCountBySession.get(attempt.exam_session_id) ?? 0) + 1);
    }
  }

  return (sessions ?? []).map((session) => {
    const assessment = Array.isArray(session.assessments) ? session.assessments[0] : session.assessments;
    const version = Array.isArray(session.assessment_versions) ? session.assessment_versions[0] : session.assessment_versions;
    return {
      ...(session as ExamSession),
      assessment_title: assessment?.title ?? session.title,
      paper_code: assessment?.paper_code ?? null,
      subject: assessment?.subject ?? null,
      version_status: version?.status ?? null,
      attempt_count: attemptCountBySession.get(session.id) ?? 0,
    };
  });
}

export async function listSessionAssessmentOptions(): Promise<SessionAssessmentOption[]> {
  if (isDemoModeEnabled()) return [];
  const supabase = await createSupabaseServerClient();
  const { data: assessments, error } = await supabase
    .from("assessments")
    .select("id,title,paper_code,subject")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const assessmentIds = (assessments ?? []).map((assessment) => assessment.id);
  const versionsByAssessment = new Map<string, AssessmentVersion>();
  if (assessmentIds.length) {
    const { data: versions, error: versionError } = await supabase
      .from("assessment_versions")
      .select("id,assessment_id,version_no,status")
      .in("assessment_id", assessmentIds)
      .order("version_no", { ascending: false });
    if (versionError) throw versionError;
    for (const version of versions ?? []) {
      if (!versionsByAssessment.has(version.assessment_id)) versionsByAssessment.set(version.assessment_id, version as AssessmentVersion);
    }
  }
  return (assessments ?? []).map((assessment) => ({
    assessment,
    latestVersion: versionsByAssessment.get(assessment.id) ?? null,
  }));
}

export async function getOwnerExamSession(sessionId: string) {
  if (isDemoModeEnabled()) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("exam_sessions")
    .select("*, assessments(title,paper_code,subject), assessment_versions(status,version_no)")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return data as (ExamSession & { assessments?: Pick<Assessment, "title" | "paper_code" | "subject"> | null; assessment_versions?: Pick<AssessmentVersion, "status" | "version_no"> | null }) | null;
}

export async function getLiveSessionAttempts(sessionId: string): Promise<LiveSessionAttempt[]> {
  if (isDemoModeEnabled()) return [];
  const supabase = await createSupabaseServerClient();
  const { data: attempts, error } = await supabase
    .from("attempts")
    .select("*")
    .eq("exam_session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const attemptRows = (attempts ?? []) as Attempt[];
  const attemptIds = attemptRows.map((attempt) => attempt.id);
  const [profiles, rosterEntries, uploadSlots, events, responses, issueMessages] = await Promise.all([
    loadProfiles(attemptRows.map((attempt) => attempt.assignee_profile_id).filter((id): id is string => Boolean(id))),
    loadRosterEntries(attemptRows.map((attempt) => attempt.roster_entry_id).filter((id): id is string => Boolean(id))),
    loadUploadSlots(attemptIds),
    loadAttemptEvents(attemptIds),
    loadTextResponses(attemptIds),
    loadTechnicalIssueMessages(sessionId),
  ]);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const rosterById = new Map(rosterEntries.map((entry) => [entry.id, entry]));
  const slotsByAttempt = new Map<string, UploadSlot[]>();
  for (const slot of uploadSlots) {
    slotsByAttempt.set(slot.attempt_id, [...(slotsByAttempt.get(slot.attempt_id) ?? []), slot]);
  }
  const eventsByAttempt = groupByAttempt(events);
  const responseCountByAttempt = new Map<string, number>();
  for (const response of responses) responseCountByAttempt.set(response.attempt_id, (responseCountByAttempt.get(response.attempt_id) ?? 0) + 1);
  const issueCountByAttempt = new Map<string, number>();
  for (const message of issueMessages) {
    if (!message.attempt_id) continue;
    issueCountByAttempt.set(message.attempt_id, (issueCountByAttempt.get(message.attempt_id) ?? 0) + 1);
  }
  const serverNowUtc = new Date().toISOString();
  return attemptRows.map((attempt) => {
    const roster = attempt.roster_entry_id ? rosterById.get(attempt.roster_entry_id) : null;
    const profile = attempt.assignee_profile_id ? profileById.get(attempt.assignee_profile_id) : null;
    const attemptEvents = eventsByAttempt.get(attempt.id) ?? [];
    const lastEvent = attemptEvents[attemptEvents.length - 1] ?? null;
    const lastHeartbeat = [...attemptEvents].reverse().find((event) => /heartbeat/i.test(event.event_type));
    const currentQuestionEvent = [...attemptEvents].reverse().find((event) => {
      const payload = asRecord(event.payload_json);
      return Boolean(payload.question_node_key || payload.question_node_id);
    });
    const currentPayload = currentQuestionEvent ? asRecord(currentQuestionEvent.payload_json) : {};
    const heartbeatGapSeconds = lastHeartbeat?.server_received_at
      ? Math.max(0, Math.floor((Date.parse(serverNowUtc) - Date.parse(lastHeartbeat.server_received_at)) / 1000))
      : null;
    return {
      attempt,
      studentName: attempt.guest_student_name ?? roster?.display_name ?? profile?.display_name ?? "Guest student",
      studentNumber: attempt.guest_student_number ?? roster?.student_number ?? null,
      state: computeAttemptState({
        serverNowUtc,
        startAtUtc: attempt.start_at_utc,
        endAtUtc: attempt.end_at_utc,
        uploadDeadlineAtUtc: attempt.upload_deadline_at_utc,
        solutionsRequested: attempt.solutions_requested,
      }),
      uploadSlots: slotsByAttempt.get(attempt.id) ?? [],
      responseCount: responseCountByAttempt.get(attempt.id) ?? 0,
      currentQuestionKey: typeof currentPayload.question_node_key === "string"
        ? currentPayload.question_node_key
        : typeof currentPayload.question_node_id === "string"
          ? currentPayload.question_node_id.slice(0, 8)
          : null,
      lastEventAt: lastEvent?.server_received_at ?? null,
      lastEventType: lastEvent?.event_type ?? null,
      heartbeatGapSeconds,
      technicalIssueCount: issueCountByAttempt.get(attempt.id) ?? 0,
    };
  });
}

export async function getLiveSessionMessages(sessionId: string): Promise<InvigilationMessage[]> {
  if (isDemoModeEnabled()) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invigilation_messages")
    .select("*")
    .eq("exam_session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as InvigilationMessage[];
}

export async function getReconciliationCandidates(sessionId: string): Promise<ReconciliationCandidate[]> {
  if (isDemoModeEnabled()) return [];
  const supabase = await createSupabaseServerClient();
  const { data: attempts, error } = await supabase
    .from("attempts")
    .select("*")
    .eq("exam_session_id", sessionId)
    .or("claim_status.eq.unclaimed,identity_review_status.eq.needs_review")
    .order("created_at", { ascending: true });
  if (error) throw error;
  const attemptRows = (attempts ?? []) as Attempt[];
  const numbers = [...new Set(attemptRows.map((attempt) => attempt.guest_student_number).filter((value): value is string => Boolean(value)))];
  const session = await getOwnerExamSession(sessionId);
  const rosterByNumber = new Map<string, StudentRosterEntry>();
  if (numbers.length && session) {
    const { data: roster, error: rosterError } = await supabase
      .from("student_roster_entries")
      .select("*")
      .eq("owner_profile_id", session.owner_profile_id)
      .in("student_number", numbers);
    if (rosterError) throw rosterError;
    for (const entry of (roster ?? []) as StudentRosterEntry[]) rosterByNumber.set(entry.student_number, entry);
  }
  return attemptRows.map((attempt) => ({
    attempt,
    guestName: attempt.guest_student_name ?? "Guest student",
    guestNumber: attempt.guest_student_number ?? null,
    matchedRosterEntry: attempt.guest_student_number ? rosterByNumber.get(attempt.guest_student_number) ?? null : null,
  }));
}

async function loadProfiles(ids: string[]): Promise<Pick<Profile, "id" | "display_name">[]> {
  if (!ids.length) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("profiles").select("id,display_name").in("id", ids);
  if (error) throw error;
  return data ?? [];
}

async function loadRosterEntries(ids: string[]): Promise<StudentRosterEntry[]> {
  if (!ids.length) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("student_roster_entries").select("*").in("id", ids);
  if (error) throw error;
  return (data ?? []) as StudentRosterEntry[];
}

async function loadUploadSlots(attemptIds: string[]): Promise<UploadSlot[]> {
  if (!attemptIds.length) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("upload_slots").select("*").in("attempt_id", attemptIds);
  if (error) throw error;
  return (data ?? []) as UploadSlot[];
}

async function loadAttemptEvents(attemptIds: string[]): Promise<AttemptEvent[]> {
  if (!attemptIds.length) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("attempt_events")
    .select("*")
    .in("attempt_id", attemptIds)
    .order("server_received_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AttemptEvent[];
}

async function loadTextResponses(attemptIds: string[]): Promise<Pick<TextResponse, "attempt_id">[]> {
  if (!attemptIds.length) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("text_responses").select("attempt_id").in("attempt_id", attemptIds);
  if (error) throw error;
  return data ?? [];
}

async function loadTechnicalIssueMessages(sessionId: string): Promise<Pick<InvigilationMessage, "attempt_id">[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invigilation_messages")
    .select("attempt_id")
    .eq("exam_session_id", sessionId)
    .eq("message_kind", "technical_issue");
  if (error) throw error;
  return data ?? [];
}

function groupByAttempt(events: AttemptEvent[]) {
  const grouped = new Map<string, AttemptEvent[]>();
  for (const event of events) grouped.set(event.attempt_id, [...(grouped.get(event.attempt_id) ?? []), event]);
  return grouped;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function requireOwnerProfileId() {
  const { profile } = await getCurrentUserProfile();
  if (!profile || profile.app_role !== "owner") throw new Error("Owner profile required");
  return profile.id;
}
