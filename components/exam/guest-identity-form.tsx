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
  state: "WAITING" | "ACTIVE" | "UPLOAD_ONLY" | "FINISHED_REVIEW";
  session_status: "lobby" | "live";
  countdown_target_utc: string | null;
};

export function GuestIdentityForm({ code }: { code: string }) {
  const router = useRouter();
  const [studentName, setStudentName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [classGroup, setClassGroup] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const response = await invokePublicEdgeFunction<JoinExamSessionResponse>("join-exam-session", {
          body: {
            code,
            student_name: studentName,
            student_number: normalizeStudentNumber(studentNumber),
            class_group: classGroup,
          },
        });
        if (!response?.ok) throw new Error("Could not join this exam.");
        sessionStorage.setItem("examvault_guest_token", response.guest_token);
        sessionStorage.setItem("examvault_guest_attempt_id", response.attempt_id);
        sessionStorage.setItem("examvault_guest_state_token", response.state_token);
        router.push(response.state === "ACTIVE" ? "/exam/live" : "/exam/lobby");
      } catch (submissionError) {
        setError(submissionError instanceof Error ? submissionError.message : "Could not start this exam.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" aria-label="Student identity">
      <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm leading-6 text-[var(--muted)]">
        Enter the details exactly as your teacher instructed. You do not need an account to sit this exam.
      </div>
      <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
        Full name
        <input
          value={studentName}
          onChange={(event) => setStudentName(event.target.value)}
          className="min-h-11 rounded-[2px] border border-[var(--border)] bg-white px-3 outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
          required
        />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
        Student number
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
            required
          />
        </div>
      </label>
      <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
        Class or group <span className="font-normal text-[var(--muted)]">(optional)</span>
        <input
          value={classGroup}
          onChange={(event) => setClassGroup(event.target.value)}
          className="min-h-11 rounded-[2px] border border-[var(--border)] bg-white px-3 outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
        />
      </label>
      {error ? <p className="rounded-[4px] border border-[var(--danger)]/20 bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}
      <Button type="submit" isLoading={isPending} className="justify-between">
        Enter waiting room
        <ArrowRight size={16} aria-hidden="true" />
      </Button>
    </form>
  );
}
