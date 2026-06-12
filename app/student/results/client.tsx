"use client";

import { useEffect, useState } from "react";
import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Award, Calendar, Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusMessage } from "@/components/ui/status-message";

interface ResultItem {
  feedback_release_id?: string | null;
  attempt_id: string;
  assessment_title: string;
  paper_code: string | null;
  released_at: string;
  total_awarded_marks: number;
  total_available_marks: number;
  release_marks?: boolean | null;
}

export function StudentResultsListClient() {
  const [results, setResults] = useState<ResultItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createSupabaseBrowserClient();
        const data = await invokeEdgeFunction<{ results: ResultItem[] }>(supabase, "list-student-results", { body: {} });
        setResults(data?.results ?? []);
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.error("Failed to load student results:", err);
        }
        setError(err instanceof Error ? err.message : "Failed to load results");
      }
    }
    load();
  }, []);

  if (error) {
    return (
      <>
        <SectionHeading title="Marked exams" description="Review your performance, marks, and teacher feedback for completed assessments." />
        <Card className="mt-8">
          <StatusMessage tone="danger">Error loading results: {error}</StatusMessage>
        </Card>
      </>
    );
  }

  if (!results) {
    return (
      <>
        <SectionHeading title="Marked exams" description="Review your performance, marks, and teacher feedback for completed assessments." />
        <div className="mt-16 flex flex-col items-center justify-center gap-3 text-[var(--muted)]" role="status">
          <Loader2 size={32} className="animate-spin opacity-50" />
          <p className="text-sm font-semibold">Loading released results</p>
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
          <EmptyState
            title="No results released yet"
            description="Once an exam is marked and feedback is released, it will appear here with only the materials you are allowed to see."
            className="bg-white"
          />
        ) : (
          results.map((result) => (
            <Card key={result.attempt_id} className="transition-colors hover:border-[var(--primary)]/30">
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 mb-1">
                     <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--subtle)]">
                       {result.paper_code || "EXAM"}
                     </span>
                  </div>
                  <h2 className="text-xl font-semibold tracking-tight text-[var(--ink)]">
                    {result.assessment_title}
                  </h2>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--muted)]">
                    <span className="flex items-center gap-1.5">
                      <Calendar size={14} />
                      Released {new Date(result.released_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--subtle)] flex items-center justify-end gap-1.5">
                      <Award size={12} /> Score
                    </div>
                    <div className="text-2xl font-semibold tracking-tight text-[var(--ink)]">
                      {result.release_marks === false ? "Released" : result.total_awarded_marks}
                      {result.release_marks === false ? null : <span className="text-sm font-bold text-[var(--subtle)] ml-1">/ {result.total_available_marks}</span>}
                    </div>
                  </div>
                  <ButtonLink 
                    href={`/student/attempts/${result.attempt_id}/results`}
                    className="h-12 px-6"
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
