import { SectionHeading } from "@/components/section-heading";
import { listStudentResults } from "@/lib/live-data";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { FileCheck, Award, Calendar } from "lucide-react";

export default async function StudentResultsListingPage() {
  const results = await listStudentResults();
  
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
