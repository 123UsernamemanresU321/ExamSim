"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, IdCard } from "lucide-react";
import { invokePublicEdgeFunction } from "@/lib/supabase/functions-client";
import { normalizeStudentNumber } from "@/lib/examsim/guest-access";
import { Button } from "@/components/ui/button";

type JoinExamSessionResponse = {
  ok: boolean;
  attempt_id: string;
  guest_token: string;
  state_token: string;
  state: "WAITING" | "ACTIVE" | "PAUSED" | "UPLOAD_ONLY" | "FINISHED_REVIEW";
  session_status: "lobby" | "live";
  countdown_target_utc: string | null;
  roster_match?: boolean;
  identity_review_status?: string;
};

type IdentityPolicy = {
  student_name?: boolean;
  student_number?: boolean;
  require_roster_match?: boolean;
  allow_unregistered_guests?: boolean;
};

export function GuestIdentityForm({ code }: { code: string }) {
  const router = useRouter();
  const [identityPolicy] = useState<IdentityPolicy>(() => readStoredIdentityPolicy());
  const requireStudentNumber = identityPolicy.require_roster_match !== false || identityPolicy.student_number !== false;
  const requireStudentName = identityPolicy.student_name !== false;
  const [studentName, setStudentName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [classGroup, setClassGroup] = useState("");
  const [sittingDate, setSittingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmNameMismatch, setConfirmNameMismatch] = useState(false);
  const [showNameMismatchConfirm, setShowNameMismatchConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus(null);
    startTransition(async () => {
      try {
        const response = await invokePublicEdgeFunction<JoinExamSessionResponse>("join-exam-session", {
          body: {
            code,
            student_name: studentName,
            student_number: normalizeStudentNumber(studentNumber),
            class_group: classGroup,
            sitting_date: sittingDate,
            confirm_name_mismatch: confirmNameMismatch,
          },
        });
        if (!response?.ok) throw new Error("Could not join this exam.");
        setStatus(response.roster_match ? "Matched to student roster. Opening exam..." : "Guest entry accepted for teacher review. Opening exam...");
        sessionStorage.setItem("examvault_guest_code", code);
        sessionStorage.setItem("examvault_guest_student_name", studentName.trim());
        sessionStorage.setItem("examvault_guest_student_number", normalizeStudentNumber(studentNumber));
        if (classGroup.trim()) sessionStorage.setItem("examvault_guest_class_group", classGroup.trim());
        sessionStorage.setItem("examvault_guest_token", response.guest_token);
        sessionStorage.setItem("examvault_guest_attempt_id", response.attempt_id);
        sessionStorage.setItem("examvault_guest_state_token", response.state_token);
        window.setTimeout(() => {
          router.push(response.state === "ACTIVE" ? "/exam/live" : "/exam/lobby");
        }, 450);
      } catch (submissionError) {
        const message = submissionError instanceof Error ? submissionError.message : "Could not start this exam.";
        setShowNameMismatchConfirm(message.toLowerCase().includes("does not match the roster"));
        setError(message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" aria-label="Student identity">
      <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm leading-6 text-[var(--muted)]">
        Your student number is issued by your teacher and stays the same across exams. It is used to match your submission to the roster; it is not a password.
        {identityPolicy.allow_unregistered_guests ? " This exam also allows teacher-reviewed unregistered guest entry." : ""}
      </div>
      <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
        Student Number {requireStudentNumber ? null : <span className="font-normal text-[var(--muted)]">(optional)</span>}
        <div className="flex rounded-[2px] border border-[var(--border)] bg-white focus-within:ring-2 focus-within:ring-[var(--primary)]/20">
          <span className="grid w-11 place-items-center border-r border-[var(--border)] text-[var(--muted)]">
            <IdCard size={16} aria-hidden="true" />
          </span>
          <input
            value={studentNumber}
            onChange={(event) => setStudentNumber(event.target.value)}
            onBlur={() => setStudentNumber(normalizeStudentNumber(studentNumber))}
            placeholder="DP1-007"
            autoCapitalize="characters"
            className="min-h-11 flex-1 bg-transparent px-3 font-mono uppercase outline-none"
            required={requireStudentNumber}
          />
        </div>
        <span className="text-xs font-normal text-[var(--muted)]">Examples: DP1-007, MYP5-012, G11-026, E001.</span>
      </label>
      <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
        Student Name {requireStudentName ? null : <span className="font-normal text-[var(--muted)]">(optional)</span>}
        <input
          value={studentName}
          onChange={(event) => setStudentName(event.target.value)}
          className="min-h-11 rounded-[2px] border border-[var(--border)] bg-white px-3 outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
          required={requireStudentName}
        />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
        Date
        <input
          type="date"
          value={sittingDate}
          onChange={(event) => setSittingDate(event.target.value)}
          className="min-h-11 rounded-[2px] border border-[var(--border)] bg-white px-3 outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
          required
        />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
        Class or group <span className="font-normal text-[var(--muted)]">(optional)</span>
        <input
          value={classGroup}
          onChange={(event) => setClassGroup(event.target.value)}
          className="min-h-11 rounded-[2px] border border-[var(--border)] bg-white px-3 outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
        />
      </label>
      {showNameMismatchConfirm ? (
        <label className="flex items-start gap-3 rounded-[4px] border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          <input
            type="checkbox"
            checked={confirmNameMismatch}
            onChange={(event) => setConfirmNameMismatch(event.target.checked)}
            className="mt-1"
          />
          <span>I have checked my details and want the teacher to review this roster mismatch.</span>
        </label>
      ) : null}
      {error ? <p className="rounded-[4px] border border-[var(--danger)]/20 bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}
      {status ? <p className="rounded-[4px] border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{status}</p> : null}
      <Button type="submit" isLoading={isPending} className="justify-between">
        Enter waiting room
        <ArrowRight size={16} aria-hidden="true" />
      </Button>
    </form>
  );
}

function readStoredIdentityPolicy(): IdentityPolicy {
  if (typeof window === "undefined") return {};
  const raw = sessionStorage.getItem("examvault_guest_identity_policy");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as IdentityPolicy : {};
  } catch {
    return {};
  }
}
