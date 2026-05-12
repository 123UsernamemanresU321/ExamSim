import { SectionHeading } from "@/components/section-heading";
import { StudentResultsWorkspace } from "@/components/student/student-results-workspace";
import { getStudentAttemptResultsWorkspace } from "@/lib/live-data";

/**
 * Server wrapper for the released student results page.
 */
export default async function StudentResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getStudentAttemptResultsWorkspace(id);

  if (!workspace.attempt) {
    return <SectionHeading title="Attempt not found" description="Open the student dashboard and choose a released result." />;
  }

  if (workspace.packageError) {
    return <SectionHeading title="Results not available" description={workspace.packageError} />;
  }

  return <StudentResultsWorkspace workspace={workspace} attemptId={id} />;
}
