import { AlertTriangle, ArrowRight, CheckCircle2, Download, RotateCcw, Lock, ShieldCheck } from "lucide-react";
import { SubmitExamButton } from "@/components/submit-exam-button";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AttemptStateBadge } from "@/components/attempt-state-badge";
import { saveAccessibilityPreferences, saveNotificationPreferences } from "@/app/student/student-actions";
import { ServerTimeVerificationCard } from "@/components/student/server-time-verification-card";
import { StudentProgressScoreFilter } from "@/components/student/student-progress-score-filter";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/form";
import { StatCard } from "@/components/ui/stat-card";
import { formatInTimezone } from "@/lib/attempt-state";
import { generateIcsEvent, type FinalizationChecklist, type StudentAttemptCard, type StudentCommandCenterData, type StudentFeedbackCard, type StudentProgressSnapshot } from "@/lib/student-experience";
import type { StudentDevice, StudentDeviceCheck, StudentIncidentReport, StudentNotification, StudentNotificationPreferences, StudentPerformancePreferences, UploadQueueEvent, UploadSlot } from "@/types/database";

export function StudentCommandCenter({ data }: { data: StudentCommandCenterData }) {
  const unreadFeedback = data.feedbackPreview.filter((item) => !item.read_at);
  const upcomingAttempts = data.timeline.filter((attempt) => attempt.state === "WAITING" || attempt.state === "ACTIVE" || attempt.state === "UPLOAD_ONLY").slice(0, 4);
  const notificationUnread = data.notifications.filter((item) => !item.read_at).length;

  return (
    <div className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Active Simulation" value={data.attempts.filter((attempt) => attempt.state === "ACTIVE").length} tone="success" />
        <SummaryCard label="Upcoming Scheduled" value={data.attempts.filter((attempt) => attempt.state === "WAITING").length} tone="active" />
        <SummaryCard label="Unread Feedback" value={unreadFeedback.length} tone="warning" />
        <SummaryCard label="Urgent Notifications" value={notificationUnread} tone="default" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Urgent actions</CardTitle>
            <CardDescription>Actions requiring your immediate attention.</CardDescription>
          </CardHeader>
          {data.urgentActions.length ? (
            <div className="grid gap-3 p-1">
              {data.urgentActions.slice(0, 5).map((action) => (
                <Link 
                  key={`${action.kind}-${action.attempt.id}`} 
                  href={action.href} 
                  className={cn(
                    "flex items-center justify-between gap-4 rounded-lg border p-4 hover:bg-[var(--surface-muted)]",
                    action.kind === "active_exam" ? "border-[var(--success)] bg-[var(--success-bg)]/20 hover:bg-[var(--success-bg)]/35" :
                    action.kind === "failed_upload" || action.kind === "upload_deadline" ? "border-[var(--danger)] bg-[var(--danger-bg)]/20 hover:bg-[var(--danger-bg)]/35" :
                    "border-[var(--border)] bg-white hover:bg-[var(--surface-muted)]"
                  )}
                >
                  <div className="grid gap-1">
                    <span className={cn(
                      "w-fit rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                      action.kind === "active_exam" ? "bg-[var(--success)] !text-white" :
                      action.kind === "failed_upload" || action.kind === "upload_deadline" ? "bg-[var(--danger)] !text-white" :
                      "bg-[var(--surface-panel)] text-[var(--primary)]"
                    )}>
                      {action.kind.replaceAll("_", " ")}
                    </span>
                    <p className="font-bold text-[var(--ink)] mt-1">{action.label}</p>
                    <p className="text-sm text-[var(--muted)]">{action.attempt.title}{action.attempt.paper_code ? ` · ${action.attempt.paper_code}` : ""}</p>
                  </div>
                  <div className="rounded-full bg-white p-2 border border-[var(--border)] shadow-sm shrink-0">
                    <ArrowRight size={16} className="text-[var(--ink)]" aria-hidden="true" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="No urgent actions" description="All caught up! Upcoming exams and released feedback will appear here." />
          )}
        </Card>
        <div className="grid gap-5">
          <ServerTimeVerificationCard serverNowUtc={data.serverNowUtc} timezone="Africa/Johannesburg" />
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Quick links</CardTitle>
              <CardDescription>Readiness, feedback, and settings without scanning the full sidebar.</CardDescription>
            </CardHeader>
            <div className="grid gap-2">
              <ButtonLink href="/student/devices" variant="secondary">Device readiness</ButtonLink>
              <ButtonLink href="/student/feedback" variant="secondary">Feedback inbox</ButtonLink>
              <ButtonLink href="/student/notification-settings" variant="secondary">Notifications</ButtonLink>
            </div>
          </Card>
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
        <StudentAttemptTimeline attempts={upcomingAttempts} compact />
        <StudentFeedbackPreview feedback={unreadFeedback.slice(0, 4)} compact />
      </div>
    </div>
  );
}

export function StudentAttemptTimeline({ attempts, compact = false }: { attempts: StudentAttemptCard[]; compact?: boolean }) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Timeline</CardTitle>
        <CardDescription>{compact ? "Next exams and upload windows." : "Server-authoritative scheduling, start, end, and upload deadline configurations."}</CardDescription>
      </CardHeader>
      {attempts.length ? (
        <div className="grid gap-4">
          {attempts.map((attempt) => (
            <div 
              key={attempt.id} 
              className={cn(
                "relative overflow-hidden rounded-lg border p-4 pl-5",
                attempt.state === "ACTIVE" ? "border-[var(--success)] border-l-4 border-l-[var(--success)]" :
                attempt.state === "UPLOAD_ONLY" ? "border-[var(--warning)] border-l-4 border-l-[var(--warning)]" :
                "border-[var(--border)] border-l-4 border-l-[var(--subtle)]"
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-bold text-[var(--ink)]">{attempt.title}</p>
                <AttemptStateBadge state={attempt.state} />
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">
                {formatInTimezone(attempt.start_at_utc, attempt.display_timezone)} to {formatInTimezone(attempt.end_at_utc, attempt.display_timezone)}
              </p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <ButtonLink href={`/student/attempts/${attempt.id}/readiness`} variant="secondary">
                  Run Readiness
                </ButtonLink>
                {compact ? null : (
                  <a
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold hover:bg-[var(--surface-muted)]"
                    href={`data:text/calendar;charset=utf-8,${encodeURIComponent(generateIcsEvent({
                      id: attempt.id,
                      title: attempt.title,
                      paper_code: attempt.paper_code,
                      start_at_utc: attempt.start_at_utc,
                      end_at_utc: attempt.end_at_utc,
                      upload_deadline_at_utc: attempt.upload_deadline_at_utc,
                      display_timezone: attempt.display_timezone,
                      exam_url: `/student/attempts/${attempt.id}/waiting`,
                    }))}`}
                    download={`${attempt.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics`}
                  >
                    <Download size={16} aria-hidden="true" />
                    Add to Calendar (.ics)
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No assigned sessions" description="Your timeline is empty. Contact your assessment coordinator." />
      )}
    </Card>
  );
}

export function StudentFeedbackPreview({ feedback, compact = false }: { feedback: StudentFeedbackCard[]; compact?: boolean }) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Feedback inbox</CardTitle>
        <CardDescription>{compact ? "Unread released feedback." : "Released marks, commentary annotations, and response corrections."}</CardDescription>
      </CardHeader>
      {feedback.length ? (
        <div className="grid gap-3">
          {feedback.map((item) => (
            <Link 
              key={`${item.attempt_id}-${item.released_at}`} 
              href={`/student/attempts/${item.attempt_id}/results`} 
              className={cn(
                "group relative overflow-hidden rounded-lg border p-4",
                item.read_at ? "border-[var(--border)] bg-white hover:bg-[var(--surface-muted)]" : "border-[var(--border)] bg-[var(--surface-panel)]/50 hover:bg-[var(--surface-panel)]"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold text-[var(--ink)]">{item.title}</p>
                <Badge tone={item.read_at ? "neutral" : "accent"}>
                  {item.read_at ? "read" : "new feedback"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-[var(--muted)] group-hover:text-[var(--ink)]">
                {item.paper_code ?? "General"} · Released {new Date(item.released_at).toLocaleString()}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState 
          title={compact ? "No unread feedback" : "No released feedback"} 
          description={compact ? "All feedback read! Read feedback remains available in the full feedback inbox." : "Assessment reviews and mistake patterns will appear here once released by the owner."} 
        />
      )}
    </Card>
  );
}

export function StudentNotificationList({ notifications }: { notifications: StudentNotification[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent notifications</CardTitle>
        <CardDescription>In-app reminders continue working even when browser notifications are disabled.</CardDescription>
      </CardHeader>
      {notifications.length ? (
        <div className="grid gap-3">
          {notifications.map((notification) => (
            <div key={notification.id} className="rounded-md border border-[var(--border)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{notification.title}</p>
                <Badge tone={notification.read_at ? "neutral" : "accent"}>{notification.read_at ? "read" : "unread"}</Badge>
              </div>
              <p className="mt-1 text-sm text-[var(--muted)]">{notification.body}</p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No notifications" description="Exam reminders and feedback notices will be listed here." />
      )}
    </Card>
  );
}

export function StudentArchive({ attempts }: { attempts: StudentAttemptCard[] }) {
  const completed = attempts.filter((attempt) => attempt.state === "FINISHED_REVIEW");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Completed attempts</CardTitle>
        <CardDescription>Search and review finished attempts, receipts, released scores, and correction status.</CardDescription>
      </CardHeader>
      {completed.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--subtle)]">
                <th className="py-2 pr-3">Assessment</th>
                <th className="py-2 pr-3">Paper</th>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Score</th>
                <th className="py-2 pr-3">Uploads</th>
                <th className="py-2 pr-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {completed.map((attempt) => (
                <tr key={attempt.id} className="border-b border-[var(--border)]">
                  <td className="py-3 pr-3 font-semibold">{attempt.title}</td>
                  <td className="py-3 pr-3">{attempt.paper_code ?? "-"}</td>
                  <td className="py-3 pr-3">{formatInTimezone(attempt.end_at_utc, attempt.display_timezone)}</td>
                  <td className="py-3 pr-3">{formatReleasedScore(attempt)}</td>
                  <td className="py-3 pr-3">{attempt.upload_completion_percent}%</td>
                  <td className="py-3 pr-3">
                    <Link className="font-semibold text-[var(--primary)]" href={attempt.feedback_released ? `/student/attempts/${attempt.id}/results` : `/student/attempts/${attempt.id}/receipt`}>
                      {attempt.feedback_released ? "Review feedback" : "View receipt"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No completed attempts" description="Finished exams will appear after the attempt is closed." />
      )}
    </Card>
  );
}

export function StudentProgressPanel({ progress }: { progress: StudentProgressSnapshot }) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Completed attempts" value={progress.completed_attempts} />
        <SummaryCard label="Average released score" value={progress.average_released_score === null ? "No data" : `${progress.average_released_score}%`} />
        <SummaryCard label="Feedback read" value={`${progress.feedback_read_rate}%`} />
        <SummaryCard label="Confidence" value={progress.confidence_average === null ? "No data" : `${progress.confidence_average}/5`} />
      </div>
      <StudentProgressScoreFilter overallScore={progress.average_released_score} groups={progress.score_groups} />
      <Card>
        <CardHeader>
          <CardTitle>Common released mistakes</CardTitle>
          <CardDescription>Based only on mistake categories the owner released to you.</CardDescription>
        </CardHeader>
        {progress.common_mistakes.length ? (
          <div className="grid gap-2">
            {progress.common_mistakes.map((mistake) => (
              <div key={mistake.label} className="flex items-center justify-between rounded-md border border-[var(--border)] p-3">
                <span>{mistake.label}</span>
                <Badge tone="warning">{mistake.count}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No released mistake data" description="Mistake patterns appear only when feedback is released with visible categories." />
        )}
      </Card>
    </div>
  );
}

export function DeviceReadinessSummary({ devices, latestCheck }: { devices: StudentDevice[]; latestCheck: StudentDeviceCheck | null }) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Device readiness</CardTitle>
        <CardDescription>{devices.length ? `${devices.length} device record${devices.length === 1 ? "" : "s"}` : "No saved device profile yet."}</CardDescription>
      </CardHeader>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">Latest check</p>
        <Badge tone={latestCheck?.status === "passed" ? "success" : latestCheck?.status === "failed" ? "danger" : "warning"}>{latestCheck?.status ?? "not checked"}</Badge>
      </div>
      <ButtonLink className="mt-4 w-full" href="/student/devices" variant="secondary">Manage devices</ButtonLink>
    </Card>
  );
}

export function StudentDevicesPanel({ devices, checks }: { devices: StudentDevice[]; checks: StudentDeviceCheck[] }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Known devices</CardTitle>
          <CardDescription>Recent browsers used for readiness checks and exams.</CardDescription>
        </CardHeader>
        {devices.length ? devices.map((device) => (
          <div key={device.id} className="mb-3 rounded-md border border-[var(--border)] p-3">
            <p className="font-semibold">{device.display_name ?? device.browser_label ?? "Unnamed device"}</p>
            <p className="text-sm text-[var(--muted)]">Last seen {new Date(device.last_seen_at).toLocaleString()}</p>
            <Badge tone={device.last_check_status === "passed" ? "success" : device.last_check_status === "failed" ? "danger" : "warning"}>{device.last_check_status ?? "not checked"}</Badge>
          </div>
        )) : <EmptyState title="No devices saved" description="Run a readiness check to create a device profile." />}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Readiness history</CardTitle>
          <CardDescription>Past PDF, upload, fullscreen, network, and session checks.</CardDescription>
        </CardHeader>
        {checks.length ? checks.map((check) => (
          <div key={check.id} className="mb-3 flex items-center justify-between rounded-md border border-[var(--border)] p-3">
            <span>{new Date(check.created_at).toLocaleString()}</span>
            <Badge tone={check.status === "passed" ? "success" : check.status === "failed" ? "danger" : "warning"}>{check.status}</Badge>
          </div>
        )) : <EmptyState title="No readiness checks" description="Open an exam readiness page to run checks." />}
      </Card>
    </div>
  );
}

export function FinalizationChecklistPanel({ 
  checklist,
  attemptId,
  stateToken,
}: { 
  checklist: FinalizationChecklist;
  attemptId?: string;
  stateToken?: string;
}) {
  return (
    <Card className="overflow-hidden border-[var(--border)] shadow-[var(--shadow-card)]">
      <CardHeader className="border-b border-[var(--border)] bg-white pb-4">
        <div className="flex items-center gap-2 text-[var(--ink)]">
          <ShieldCheck size={22} className="text-[var(--primary)]" />
          <CardTitle className="text-lg font-semibold tracking-tight">Pre-finalization checklist</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Review upload slots, blank submissions, and warnings before locking your attempt.
        </CardDescription>
      </CardHeader>
      
      <div className="p-5 grid gap-4">
        <div className="grid gap-3">
          {checklist.items.map((item) => (
            <div 
              key={item.slot_id} 
              className={`flex items-start gap-4 rounded-lg border p-4 ${
                item.severity === "ok" 
                  ? "border-[var(--success)]/20 bg-[var(--success-bg)]/20" 
                  : item.severity === "warning"
                  ? "border-[var(--warning)]/20 bg-[var(--warning-bg)]/15"
                  : "border-[var(--danger)]/20 bg-[var(--danger-bg)]/20"
              }`}
            >
              <div className="mt-0.5">
                {item.severity === "ok" ? (
                  <CheckCircle2 className="text-[var(--success)]" size={20} />
                ) : item.severity === "warning" ? (
                  <AlertTriangle className="text-[var(--warning)]" size={20} />
                ) : (
                  <AlertTriangle className="text-[var(--danger)]" size={20} />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="font-bold text-[var(--ink)] text-sm tracking-tight">{item.label}</p>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    item.severity === "ok"
                      ? "bg-[var(--success-bg)] text-[var(--success)]"
                      : item.severity === "warning"
                      ? "bg-[var(--warning-bg)] text-[var(--warning)]"
                      : "bg-[var(--danger-bg)] text-[var(--danger)]"
                  }`}>
                    {item.severity === "ok" ? "Secured" : item.severity === "warning" ? "Optional / Empty" : "Action Required"}
                  </span>
                </div>
                <p className="text-xs text-[var(--muted)] mt-1">{item.message}</p>
                {item.file_name ? (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded bg-white px-2 py-1 text-xs border border-gray-100 text-gray-600 font-mono shadow-sm">
                    {item.file_name}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className={`mt-2 rounded-xl border p-4 text-sm relative overflow-hidden ${
          checklist.canFinalize 
            ? "border-[var(--success)]/20 bg-[var(--success-bg)]/10 text-[var(--success)]" 
            : "border-[var(--warning)]/20 bg-[var(--warning-bg)]/15 text-[var(--warning)]"
        }`}>
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              {checklist.canFinalize ? (
                <ShieldCheck size={20} className="text-[var(--success)]" />
              ) : (
                <Lock size={20} className="text-[var(--warning)]" />
              )}
            </div>
            <div>
              <p className="font-bold text-sm">
                {checklist.canFinalize 
                  ? "Verification Integrity Check Passed" 
                  : "Verification Integrity Blocked"}
              </p>
              <p className="mt-1 text-xs leading-relaxed opacity-90">
                {checklist.canFinalize 
                  ? "All required question partitions have received either a valid PDF response or a confirmed blank submission slot. The system is ready to lock and compile your work." 
                  : "Some required question blocks have not been satisfied. You must upload a document or explicitly submit a blank placeholder for each blocked slot before final submission."}
              </p>
            </div>
          </div>
        </div>

        {checklist.canFinalize && attemptId && stateToken ? (
          <div className="mt-4 border-t border-dashed border-[#dde3ee] pt-5">
            <div className="rounded-lg bg-indigo-50/40 border border-indigo-100 p-4 mb-4 text-xs text-indigo-900 leading-relaxed">
              <strong>Important:</strong> Finalizing seals your exam submission. The owner and marking staff will receive access, and you cannot reverse this lock.
            </div>
            <SubmitExamButton 
              attemptId={attemptId} 
              stateToken={stateToken} 
              className="flex w-full items-center justify-center gap-2 rounded-lg py-4 text-base font-semibold" 
            />
          </div>
        ) : !checklist.canFinalize ? (
          <div className="mt-4 rounded-xl bg-gray-100 text-gray-400 p-5 text-center font-bold text-sm border border-gray-200 cursor-not-allowed">
            Finalization locked. Complete the requirements above to unlock.
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function RecoveryStatusPanel({ slots, queueEvents, incidents, safeStatus }: { slots: UploadSlot[]; queueEvents: UploadQueueEvent[]; incidents: StudentIncidentReport[]; safeStatus: string }) {
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Upload status</CardTitle>
          <CardDescription>Safe student view of uploaded files and retry status.</CardDescription>
        </CardHeader>
        {slots.length ? slots.map((slot) => (
          <div key={slot.id} className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--border)] p-3">
            <div>
              <p className="font-semibold">{slot.original_file_name ?? `Slot ${slot.id.slice(0, 8)}`}</p>
              <p className="text-sm text-[var(--muted)]">{slot.uploaded_at ? new Date(slot.uploaded_at).toLocaleString() : "Not uploaded"}</p>
            </div>
            <Badge tone={slot.status === "uploaded" ? "success" : slot.status === "rejected" ? "danger" : "warning"}>{slot.status}</Badge>
          </div>
        )) : <EmptyState title="No upload slots" description="This attempt has no root-question PDF upload slots." />}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Next action</CardTitle>
          <CardDescription>{safeStatus.replaceAll("_", " ")}</CardDescription>
        </CardHeader>
        <div className="grid gap-3 text-sm text-[var(--muted)]">
          <p>{queueEvents.length} upload queue event{queueEvents.length === 1 ? "" : "s"} recorded.</p>
          <p>{incidents.length} incident report{incidents.length === 1 ? "" : "s"} submitted.</p>
          <ButtonLink href="../finalize" variant="secondary">
            <RotateCcw size={16} aria-hidden="true" />
            Open finalization
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}

export function NotificationPreferencesPanel({ preferences }: { preferences: StudentNotificationPreferences | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification preferences</CardTitle>
        <CardDescription>In-app reminders work by default. Browser notifications are optional.</CardDescription>
      </CardHeader>
      <form action={saveNotificationPreferences} className="grid gap-2 text-sm">
        {[
          ["exam_24h", "Exam starts in 24 hours"],
          ["exam_1h", "Exam starts in 1 hour"],
          ["exam_10m", "Exam starts in 10 minutes"],
          ["upload_deadline_10m", "Upload deadline in 10 minutes"],
          ["feedback_released", "Feedback released"],
          ["correction_reviewed", "Correction notebook reviewed"],
        ].map(([key, label]) => (
          <label key={key} className="flex items-center justify-between rounded-md border border-[var(--border)] p-3">
            <span>{label}</span>
            <input name={key} type="checkbox" defaultChecked={Boolean((preferences as unknown as Record<string, boolean> | null)?.[key] ?? true)} />
          </label>
        ))}
        <label className="flex items-center justify-between rounded-md border border-[var(--border)] p-3">
          <span>Browser notifications enabled</span>
          <input name="browser_notifications_enabled" type="checkbox" defaultChecked={preferences?.browser_notifications_enabled ?? false} />
        </label>
        <Button type="submit">
          Save notification settings
        </Button>
      </form>
    </Card>
  );
}

export function AccessibilityPreferencesPanel({ performance }: { performance: StudentPerformancePreferences | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Accessibility and bandwidth</CardTitle>
        <CardDescription>Readability settings apply to student dashboards, exam pages, upload pages, and feedback.</CardDescription>
      </CardHeader>
      <form action={saveAccessibilityPreferences} className="grid gap-3 text-sm">
        <label className="flex items-center justify-between rounded-md border border-[var(--border)] p-3">
          <span>Low-bandwidth mode</span>
          <input name="low_bandwidth_mode" type="checkbox" defaultChecked={performance?.low_bandwidth_mode ?? false} />
        </label>
        <label className="grid gap-1">
          <span className="font-semibold">Interface font size</span>
          <Select name="interface_font_size">
            <option value="normal">Normal</option>
            <option value="large">Large</option>
            <option value="extra_large">Extra large</option>
          </Select>
        </label>
        <label className="grid gap-1">
          <span className="font-semibold">Timer display</span>
          <Select name="timer_display_mode">
            <option value="full">Full</option>
            <option value="compact">Compact</option>
            <option value="final_10">Final 10 minutes only</option>
            <option value="hidden_until_warning">Hidden until warning</option>
          </Select>
        </label>
        <label className="flex items-center justify-between rounded-md border border-[var(--border)] p-3">
          <span>High contrast</span>
          <input name="high_contrast" type="checkbox" />
        </label>
        <label className="flex items-center justify-between rounded-md border border-[var(--border)] p-3">
          <span>Reduced motion</span>
          <input name="reduced_motion" type="checkbox" />
        </label>
        <p className="rounded-md bg-[var(--surface-muted)] p-3 text-[var(--muted)]">
          Font size, contrast, line spacing, timer display, reading width, and reduced-motion controls are stored in your accessibility preferences.
        </p>
        <Button type="submit">
          Save accessibility settings
        </Button>
      </form>
    </Card>
  );
}

function SummaryCard({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "active" | "warning" | "success" | "default" }) {
  const statTone = tone === "success" ? "success" : tone === "warning" ? "warning" : tone === "active" ? "info" : "neutral";
  return <StatCard label={label} value={value} tone={statTone} />;
}

function formatReleasedScore(attempt: StudentAttemptCard): string {
  if (!attempt.feedback_released) return "Unreleased";
  if (attempt.released_score_percent === null) return "Feedback only";
  return `${attempt.released_score_percent}%`;
}
