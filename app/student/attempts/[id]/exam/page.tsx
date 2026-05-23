import { redirect } from "next/navigation";
import { getAttemptScreenData } from "@/lib/attempt-screen-data";
import { ExamWorkspace } from "@/components/exam/exam-workspace";
import { getStudentMaterialsForAttempt } from "@/lib/student-experience";

export default async function ActiveExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const screenData = await getAttemptScreenData(id, true).catch((error: unknown) => ({
    error: error instanceof Error ? error.message : "Attempt could not be loaded.",
  }));

  if ("error" in screenData) {
    return (
      <section className="mx-auto grid max-w-[760px] gap-4 rounded-lg border border-[var(--border)] bg-white p-6">
        <h1 className="text-xl font-semibold text-[var(--ink)]">Attempt could not be opened</h1>
        <p className="text-sm leading-6 text-[var(--muted)]">
          {screenData.error} Open the student dashboard and choose one of your assigned attempts.
        </p>
      </section>
    );
  }

  const { attempt } = screenData;

  // Static/Initial redirects based on basic state (Works on build-time or first load)
  if (attempt.state === "WAITING") redirect(`/student/attempts/${id}/waiting`);
  if (attempt.state === "UPLOAD_ONLY") redirect(`/student/attempts/${id}/upload`);
  if (attempt.state === "FINISHED_REVIEW") redirect(`/student/attempts/${id}/finished`);

  const materials = await getStudentMaterialsForAttempt(id);

  return (
    <ExamWorkspace 
      attemptId={id} 
      initialScreenData={screenData} 
      materials={materials}
    />
  );
}
