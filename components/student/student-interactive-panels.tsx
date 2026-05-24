"use client";

import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, Bell, CheckCircle2, ShieldCheck } from "lucide-react";
import { recordReadinessCheck, generateStudentRecoveryCode } from "@/app/student/student-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { calculateServerTimeDriftStatus } from "@/lib/student-experience-core";

type CheckResult = {
  key: string;
  label: string;
  status: "passed" | "warning" | "failed" | "skipped";
  detail: string;
};

export function ReadinessCheckPanel({ attemptId, serverNowUtc }: { attemptId: string; serverNowUtc: string }) {
  const [checks, setChecks] = useState<CheckResult[]>(() => runBrowserChecks(serverNowUtc));
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [isPending, startTransition] = useTransition();
  const initialSaveDone = useRef(false);

  const overall = checks.some((check) => check.status === "failed") ? "failed" : checks.some((check) => check.status === "warning") ? "warning" : "passed";

  const saveReadinessCheck = useCallback((next: CheckResult[]) => {
    startTransition(() => {
      setSaveStatus("saving");
      void recordReadinessCheck(
        attemptId,
        {
          user_agent: navigator.userAgent,
          online: navigator.onLine,
          checks: next,
          device_id: `${navigator.userAgent}-${screen.width}x${screen.height}`,
        },
        next.some((check) => check.status === "failed") ? "failed" : next.some((check) => check.status === "warning") ? "warning" : "passed",
      )
        .then(() => setSaveStatus("saved"))
        .catch(() => setSaveStatus("failed"));
    });
  }, [attemptId]);

  useEffect(() => {
    if (initialSaveDone.current) return;
    initialSaveDone.current = true;
    saveReadinessCheck(checks);
  }, [checks, saveReadinessCheck]);

  function runAgain() {
    const next = runBrowserChecks(serverNowUtc);
    setChecks(next);
    saveReadinessCheck(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exam Lobby Readiness Check</CardTitle>
        <CardDescription>Checks session, server time, upload support, fullscreen support, storage, browser notifications, and screen size.</CardDescription>
      </CardHeader>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Badge tone={overall === "passed" ? "success" : overall === "failed" ? "danger" : "warning"}>{overall}</Badge>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--muted)]">
            {saveStatus === "saving" ? "Saving device check..." : saveStatus === "saved" ? "Device profile updated" : saveStatus === "failed" ? "Save failed" : "Ready"}
          </span>
          <Button type="button" onClick={runAgain} disabled={isPending}>{isPending ? "Saving check..." : "Run check again"}</Button>
        </div>
      </div>
      <div className="grid gap-3">
        {checks.map((check) => (
          <div key={check.key} className="flex items-start gap-3 rounded-md border border-[var(--border)] p-3">
            {check.status === "passed" ? <CheckCircle2 className="mt-0.5 text-[var(--success)]" size={18} /> : <AlertTriangle className="mt-0.5 text-[var(--warning)]" size={18} />}
            <div>
              <p className="font-semibold">{check.label}</p>
              <p className="text-sm text-[var(--muted)]">{check.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function BrowserNotificationPermissionCard() {
  const [permission, setPermission] = useState(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));

  async function requestPermission() {
    if (typeof Notification === "undefined") return;
    setPermission(await Notification.requestPermission());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Browser notifications</CardTitle>
        <CardDescription>Optional browser alerts supplement the in-app notification inbox.</CardDescription>
      </CardHeader>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge tone={permission === "granted" ? "success" : permission === "denied" ? "danger" : "warning"}>{permission}</Badge>
        <Button type="button" onClick={() => void requestPermission()}>
          <Bell size={16} aria-hidden="true" />
          Request permission
        </Button>
      </div>
    </Card>
  );
}

export function RecoveryCodeGenerator() {
  const [state, formAction, pending] = useActionState(async () => generateStudentRecoveryCode(), { code: null, error: null } as { code: string | null; error: string | null });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recovery code</CardTitle>
        <CardDescription>Generate a one-time recovery code. The plaintext code is shown once and only its hash is stored.</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <Button type="submit" disabled={pending}>
          <ShieldCheck size={16} aria-hidden="true" />
          {pending ? "Generating..." : "Generate recovery code"}
        </Button>
      </form>
      {state.code ? <p className="mt-4 rounded-md border border-[var(--border)] bg-[var(--warning-bg)] p-3 font-mono text-sm">{state.code}</p> : null}
      {state.error ? <p className="mt-4 text-sm text-[var(--danger)]">{state.error}</p> : null}
    </Card>
  );
}

function runBrowserChecks(serverNowUtc: string): CheckResult[] {
  const drift = calculateServerTimeDriftStatus(serverNowUtc, new Date().toISOString());
  const storageOk = testStorage();
  const canRenderPdf = typeof HTMLCanvasElement !== "undefined";
  const fullscreenSupported = typeof document !== "undefined" && Boolean(document.documentElement.requestFullscreen);
  const notifications = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  const screenWarning = typeof window !== "undefined" && window.innerWidth < 760;

  return [
    { key: "session", label: "Authenticated session", status: "passed", detail: "This readiness page loaded using your student session." },
    { key: "server_time", label: "Server time", status: drift.status === "suspicious_drift" ? "warning" : drift.status === "unable_to_verify" ? "failed" : "passed", detail: drift.message },
    { key: "network", label: "Network", status: navigator.onLine ? "passed" : "failed", detail: navigator.onLine ? "Browser reports online." : "Browser reports offline." },
    { key: "storage", label: "Local browser storage", status: storageOk ? "passed" : "warning", detail: storageOk ? "Session storage is available." : "Session storage is blocked or unavailable." },
    { key: "pdf", label: "PDF preview", status: canRenderPdf ? "passed" : "warning", detail: canRenderPdf ? "Canvas rendering is available for PDF previews." : "PDF preview may be limited in this browser." },
    { key: "fullscreen", label: "Fullscreen API", status: fullscreenSupported ? "passed" : "warning", detail: fullscreenSupported ? "Browser supports fullscreen requests." : "Fullscreen may be unavailable." },
    { key: "notifications", label: "Notifications", status: notifications === "granted" ? "passed" : "warning", detail: `Browser notification permission: ${notifications}.` },
    { key: "screen", label: "Screen size", status: screenWarning ? "warning" : "passed", detail: screenWarning ? "Small screen detected; PDF upload and exam views may feel cramped." : "Screen width is suitable for exam pages." },
  ];
}

function testStorage(): boolean {
  try {
    sessionStorage.setItem("exam-vault-readiness", "1");
    sessionStorage.removeItem("exam-vault-readiness");
    return true;
  } catch {
    return false;
  }
}
