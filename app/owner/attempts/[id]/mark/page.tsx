import { SectionHeading } from "@/components/section-heading";
import { getOwnerAttemptReviewWorkspace } from "@/lib/live-data";
import { MarkingLayout } from "@/components/owner/marking-layout";

export default async function MarkAttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getOwnerAttemptReviewWorkspace(id);
  
  if (!workspace.attempt) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
        <h2 className="text-xl font-bold text-red-600">Attempt Not Found</h2>
        <p className="mt-2 text-[var(--muted)]">This attempt could not be retrieved from the server.</p>
      </div>
    );
  }

  if (!workspace.package && !workspace.questionNodes.length) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center p-8">
        <h2 className="text-xl font-bold text-red-600">Failed to load assessment content</h2>
        <p className="mt-2 text-[var(--muted)] text-center max-w-md">
          {workspace.packageError ?? "This attempt's assessment content is missing or invalid. Please check the schema or sync the question tree."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full -mx-5 -my-8 md:-mx-8">
      <div className="px-6 py-4">
        <SectionHeading
          title={`${workspace.attempt.student}'s Submission`}
          description={`Attempt ${id}. Review telemetry, mark responses, and provide feedback.`}
        />
      </div>
      <div className="flex-1 overflow-hidden px-6 pb-6">
        <MarkingLayout workspace={workspace} attemptId={id} />
      </div>
    </div>
  );
}
