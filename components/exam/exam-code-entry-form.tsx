"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound } from "lucide-react";
import { invokePublicEdgeFunction } from "@/lib/supabase/functions-client";
import { normalizeExamCode } from "@/lib/examsim/guest-access";
import { Button } from "@/components/ui/button";

type ResolveExamCodeResponse = {
  status: "invalid" | "not_open" | "lobby" | "live" | "closed";
  code?: string;
  error?: string;
  session?: {
    title?: string;
    paper_code?: string | null;
    start_at_utc?: string;
    display_timezone?: string;
  };
};

export function ExamCodeEntryForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolveExamCodeResponse | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResolved(null);
    startTransition(async () => {
      try {
        const normalized = normalizeExamCode(code);
        const response = await invokePublicEdgeFunction<ResolveExamCodeResponse>("resolve-exam-code", {
          body: { code: normalized },
        });
        if (!response) throw new Error("No response from exam-code service.");
        if (response.status === "invalid") {
          setError(response.error ?? "That exam code was not found.");
          return;
        }
        setResolved(response);
        if (response.status === "not_open") {
          router.push(`/exam/not-open?code=${encodeURIComponent(normalized)}`);
        } else if (response.status === "closed") {
          router.push(`/exam/closed?code=${encodeURIComponent(normalized)}`);
        } else {
          router.push(`/exam/identity?code=${encodeURIComponent(normalized)}`);
        }
      } catch (submissionError) {
        setError(submissionError instanceof Error ? submissionError.message : "Could not check this exam code.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" aria-label="Enter exam code">
      <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
        Exam code
        <div className="flex rounded-[4px] border border-[var(--border)] bg-white shadow-[var(--shadow-card)] focus-within:ring-2 focus-within:ring-[var(--primary)]/20">
          <span className="grid w-12 place-items-center border-r border-[var(--border)] text-[var(--muted)]">
            <KeyRound size={18} aria-hidden="true" />
          </span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="MODS-W7-120"
            autoCapitalize="characters"
            autoComplete="off"
            className="min-h-12 flex-1 bg-transparent px-4 font-mono text-base uppercase tracking-[0.08em] outline-none"
            required
          />
        </div>
      </label>
      {error ? <p className="rounded-[4px] border border-[var(--danger)]/20 bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}
      {resolved?.session ? (
        <p className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--muted)]">
          Found {resolved.session.title ?? "exam"}{resolved.session.paper_code ? ` · ${resolved.session.paper_code}` : ""}.
        </p>
      ) : null}
      <Button type="submit" isLoading={isPending} className="justify-between">
        Continue
        <ArrowRight size={16} aria-hidden="true" />
      </Button>
    </form>
  );
}
