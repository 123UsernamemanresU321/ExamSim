import { SectionHeading } from "@/components/section-heading";
import { getStudentAttemptResultsWorkspace } from "@/lib/live-data";
import { demoAttemptParams } from "@/lib/static-params";
import { StudentResultsWorkspace } from "@/components/student/student-results-workspace";
import { AppHeader } from "@/components/app-header";

export function generateStaticParams() {
  return demoAttemptParams();
}

export default async function StudentResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getStudentAttemptResultsWorkspace(id);
  
  if (!workspace.attempt) {
    return (
      <div className="flex min-h-screen flex-col bg-white">
        <AppHeader />
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <h2 className="text-xl font-bold text-red-600">Attempt Not Found</h2>
          <p className="mt-2 text-[var(--muted)]">This attempt could not be retrieved.</p>
        </div>
      </div>
    );
  }

  if (workspace.packageError) {
    return (
      <div className="flex min-h-screen flex-col bg-white">
        <AppHeader />
        <div className="px-6 py-8 md:px-12">
          <SectionHeading
            title="Results not available"
            description={workspace.attempt.title}
          />
          <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] p-12 text-center bg-slate-50/50">
            <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mb-6">
              <span className="text-2xl">⏳</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900">Feedback Pending</h2>
            <p className="mt-2 text-[var(--muted)] max-w-md">
              {workspace.packageError}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <AppHeader />
      <main className="flex flex-1 flex-col overflow-hidden px-6 py-6 md:px-12">
        <div className="mb-6 flex items-center justify-between">
          <SectionHeading
            title="Assessment Results"
            description={`${workspace.attempt.title} • Feedback released on ${new Date(workspace.feedbackRelease?.released_at ?? "").toLocaleDateString()}`}
          />
          <div className="flex flex-col items-end gap-1">
             <div className="text-[10px] font-black uppercase tracking-widest text-[var(--subtle)]">Final Grade</div>
             <div className="text-3xl font-black italic tracking-tighter text-[var(--primary)]">
               {workspace.feedbackRelease?.total_awarded_marks} <span className="text-lg text-[var(--subtle)]">/ {workspace.feedbackRelease?.total_available_marks}</span>
             </div>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <StudentResultsWorkspace workspace={workspace} attemptId={id} />
        </div>
      </main>
    </div>
  );
}
