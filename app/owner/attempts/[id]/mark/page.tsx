import { SectionHeading } from "@/components/section-heading";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { SavedViewsToolbar } from "@/components/owner/saved-views-toolbar";
import { getOwnerAttemptReviewWorkspace } from "@/lib/live-data";
import { listOwnerSavedViews } from "@/lib/owner-operations";
import { MarkingLayout } from "@/components/owner/marking-layout";
import { MarkingWorkflowPanel } from "@/components/owner/marking-workflow-panel";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AssessmentGradingPolicy, MarkingReview, MarkingSubmission } from "@/types/database";
import { PaperAttemptScanPanel, type PaperAttemptScan } from "@/components/owner/paper-attempt-scan-panel";

export default async function MarkAttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [workspace, savedViews, markingWorkflow, paperScans] = await Promise.all([
    getOwnerAttemptReviewWorkspace(id),
    listOwnerSavedViews("marking_workspace"),
    loadMarkingWorkflow(id),
    loadPaperAttemptScans(id),
  ]);
  
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
        <Breadcrumb
          items={[
            { label: "Attempts", href: "/owner/attempts" },
            { label: markingWorkflow.policy?.anonymous_grading ? `Anonymous script ${id.slice(0, 8).toUpperCase()}` : `${workspace.attempt.student}`, href: `/owner/attempts/${id}` },
            { label: "Marking" },
          ]}
        />
        <SectionHeading
          title={markingWorkflow.policy?.anonymous_grading ? `Anonymous script ${id.slice(0, 8).toUpperCase()}` : `${workspace.attempt.student}'s Submission`}
          description={`Attempt ${id}. Review telemetry, mark responses, and provide feedback.`}
        />
        <div className="mt-4">
          <SavedViewsToolbar
            scope="marking_workspace"
            views={savedViews}
            basePath={`/owner/attempts/${id}/mark`}
            currentFilters={{ attempt_id: id, selected: "current-root" }}
          />
        </div>
        <div className="mt-4">
          <MarkingWorkflowPanel attemptId={id} policy={markingWorkflow.policy} submissions={markingWorkflow.submissions} review={markingWorkflow.review} />
        </div>
        <PaperAttemptScanPanel scans={paperScans} />
      </div>
      <div className="flex-1 overflow-hidden px-6 pb-6">
        <MarkingLayout workspace={workspace} attemptId={id} />
      </div>
    </div>
  );
}

async function loadPaperAttemptScans(attemptId: string): Promise<PaperAttemptScan[]> {
  const supabase = await createSupabaseServerClient();
  const { data: pages, error: pageError } = await supabase.from("paper_mode_scan_pages").select("id,paper_mode_scan_id,page_number,question_node_id,mapping_status").eq("attempt_id", attemptId).eq("mapping_status", "mapped").order("page_number");
  if (pageError) throw pageError;
  const scanIds = [...new Set((pages ?? []).map((page) => page.paper_mode_scan_id))];
  if (!scanIds.length) return [];
  const { data: scans, error: scanError } = await supabase.from("paper_mode_scans").select("id,object_path,original_file_name").in("id", scanIds);
  if (scanError) throw scanError;
  const scansById = new Map((scans ?? []).map((scan) => [scan.id, scan]));
  return (pages ?? []).flatMap((page) => {
    const scan = scansById.get(page.paper_mode_scan_id);
    return scan ? [{ pageId: page.id, pageNumber: page.page_number, questionNodeId: page.question_node_id, mappingStatus: page.mapping_status, objectPath: scan.object_path, fileName: scan.original_file_name }] : [];
  });
}

async function loadMarkingWorkflow(attemptId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: attempt, error: attemptError } = await supabase.from("attempts").select("assessment_id").eq("id", attemptId).single();
  if (attemptError) throw attemptError;
  const [{ data: policy, error: policyError }, { data: submissions, error: submissionsError }, { data: review, error: reviewError }] = await Promise.all([
    supabase.from("assessment_grading_policies").select("*").eq("assessment_id", attempt.assessment_id).maybeSingle(),
    supabase.from("marking_submissions").select("*").eq("attempt_id", attemptId).order("submitted_at"),
    supabase.from("marking_reviews").select("*").eq("attempt_id", attemptId).maybeSingle(),
  ]);
  if (policyError) throw policyError;
  if (submissionsError) throw submissionsError;
  if (reviewError) throw reviewError;
  return { policy: policy as AssessmentGradingPolicy | null, submissions: (submissions ?? []) as MarkingSubmission[], review: review as MarkingReview | null };
}
