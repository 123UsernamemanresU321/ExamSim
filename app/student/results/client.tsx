"use client";

import { useEffect, useState } from "react";
import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { FileCheck, Award, Calendar, Loader2 } from "lucide-react";
import type { AttemptSummary } from "@/lib/live-data-client";
import type { FeedbackRelease, Attempt, Assessment } from "@/types/database";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { computeAttemptState } from "@/lib/attempt-state";

export function StudentResultsListClient() {
  const [results, setResults] = useState<(AttemptSummary & { feedback: FeedbackRelease })[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: attempts, error: attemptsError } = await supabase
          .from("attempts")
          .select(`*, feedback_releases!inner(*)`)
          .order("created_at", { ascending: false });

        if (attemptsError) throw attemptsError;

        const assessmentIds = Array.from(new Set(attempts.map((a) => a.assessment_id)));
        const { data: assessments } = await supabase.from("assessments").select("*").in("id", assessmentIds);
        const assessmentMap = new Map((assessments ?? []).map((a) => [a.id, a as Assessment]));

        const summaries = (attempts ?? []).map((a) => {
          const attempt = a as unknown as Attempt;
          const serverNowUtc = new Date().toISOString();
          const state = computeAttemptState({
            serverNowUtc,
            startAtUtc: attempt.start_at_utc,
            endAtUtc: attempt.end_at_utc,
            uploadDeadlineAtUtc: attempt.upload_deadline_at_utc,
            solutionsRequested: attempt.solutions_requested,
          });
          const assessment = assessmentMap.get(attempt.assessment_id);
          
          const summary: AttemptSummary = {
            id: attempt.id,
            title: assessment?.title ?? "Untitled assessment",
            paper_code: assessment?.paper_code ?? null,
            student: "Student", // We don't need the exact name for this view
            start_at_utc: attempt.start_at_utc,
            end_at_utc: attempt.end_at_utc,
            upload_deadline_at_utc: attempt.upload_deadline_at_utc,
            duration_seconds: attempt.duration_seconds,
            display_timezone: attempt.display_timezone,
            solutions_requested: attempt.solutions_requested,
            delivery_mode: attempt.delivery_mode,
            state,
            countdown_target_utc: attempt.upload_deadline_at_utc ?? attempt.end_at_utc,
            server_now_utc: serverNowUtc,
            owner_profile_id: assessment?.owner_profile_id ?? "",
            seb_config_path: (assessment as any)?.seb_config_path ?? null,
            seb_config_url: null,
          };

          return {
            ...summary,
            feedback: (a as unknown as { feedback_releases: FeedbackRelease[] }).feedback_releases[0]
          };
        });

        setResults(summaries);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load results");
      }
    }
    load();
  }, []);

  if (error) {
    return (
      <>
        <SectionHeading title="Marked exams" description="Review your performance, marks, and teacher feedback for completed assessments." />
        <Card className="mt-8 flex flex-col items-center justify-center p-8 text-center text-red-600 bg-red-50">
          <p>Error loading results: {error}</p>
        </Card>
      </>
    );
  }

  if (!results) {
    return (
      <>
        <SectionHeading title="Marked exams" description="Review your performance, marks, and teacher feedback for completed assessments." />
        <div className="mt-16 flex items-center justify-center text-[var(--muted)]">
          <Loader2 size={32} className="animate-spin opacity-50" />
        </div>
      </>
    );
  }

  return (
    <>
      <SectionHeading
        title="Marked exams"
        description="Review your performance, marks, and teacher feedback for completed assessments."
      />
      
      <div className="mt-8 grid gap-4">
        {results.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-16 text-center bg-slate-50/50 border-dashed">
            <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mb-4 text-slate-400">
              <FileCheck size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">No results released yet</h3>
            <p className="text-sm text-slate-500 max-w-xs mt-2">
              Once your exams are marked and feedback is released by your teacher, they will appear here.
            </p>
          </Card>
        ) : (
          results.map((result) => (
            <Card key={result.id} className="group transition-all hover:shadow-md hover:border-[var(--primary)]/30">
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 mb-1">
                     <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtle)]">
                       {result.paper_code || "EXAM"}
                     </span>
                  </div>
                  <h2 className="text-xl font-extrabold tracking-tight text-[var(--ink)] group-hover:text-[var(--primary)] transition-colors">
                    {result.title}
                  </h2>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--muted)]">
                    <span className="flex items-center gap-1.5">
                      <Calendar size={14} />
                      Released {new Date(result.feedback.released_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtle)] flex items-center justify-end gap-1.5">
                      <Award size={12} /> Score
                    </div>
                    <div className="text-2xl font-black italic tracking-tighter text-[var(--ink)]">
                      {result.feedback.total_awarded_marks}
                      <span className="text-sm font-bold text-[var(--subtle)] ml-1">/ {result.feedback.total_available_marks}</span>
                    </div>
                  </div>
                  <ButtonLink 
                    href={`/student/attempts/${result.id}/results`}
                    className="h-12 px-6 font-black uppercase tracking-widest shadow-sm"
                  >
                    Review feedback
                  </ButtonLink>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
