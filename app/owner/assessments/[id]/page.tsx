import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteAssessmentButton } from "@/components/owner/delete-assessment-button";
import { QtiExportButton } from "@/components/owner/qti-export-button";
import { GradingPolicyPanel } from "@/components/owner/grading-policy-panel";
import { SectionHeading } from "@/components/section-heading";
import { getAssessmentWorkspace } from "@/lib/live-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AssessmentGradingPolicy } from "@/types/database";

export default async function AssessmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [workspace, gradingPolicy] = await Promise.all([getAssessmentWorkspace(id), loadGradingPolicy(id)]);
  if (!workspace) {
    return <SectionHeading title="Assessment not found" description={`No assessment exists for ${id}.`} />;
  }
  return (
    <>
      <SectionHeading
        title={workspace.assessment.title}
        description={`Assessment ${id} · ${workspace.assessment.paper_code ?? "No paper code"}`}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <GradingPolicyPanel assessmentId={id} policy={gradingPolicy} />
        <Card>
          <h2 className="text-lg font-semibold">Draft review</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Review deterministic parse output before publish.</p>
          <ButtonLink className="mt-4" href={`/owner/assessments/${id}/review`} variant="secondary">
            Review tree
          </ButtonLink>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Publish and assign</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Freeze version, convert local time to UTC, and create attempts.</p>
          <ButtonLink className="mt-4" href={`/owner/assessments/${id}/publish`}>
            Publish
          </ButtonLink>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Source security</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Source files and normalized packages are private and released through Edge Functions only.
          </p>
          <p className="mt-3 text-sm font-semibold text-[var(--primary)]">
            Latest version: {workspace.latestVersion?.status ?? "none"}
          </p>
          {workspace.latestVersion ? <div className="mt-4"><QtiExportButton versionId={workspace.latestVersion.id} /></div> : null}
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Visual authoring</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Edit question cards, marks, response types, source anchors, and validation fields without raw JSON.</p>
          <ButtonLink className="mt-4" href={`/owner/assessments/${id}/authoring`} variant="secondary">
            Open editor
          </ButtonLink>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Smart compiler</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Review PDF source documents, question regions, confidence warnings, and manual fallback boxes.</p>
          <ButtonLink className="mt-4" href={`/owner/assessments/${id}/compiler`} variant="secondary">
            Open compiler
          </ButtonLink>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">LaTeX workspace</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Validate Examsim LaTeX syntax before it becomes internal structured exam data.</p>
          <ButtonLink className="mt-4" href={`/owner/assessments/${id}/latex`} variant="secondary">
            Open LaTeX import
          </ButtonLink>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Rubrics</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Build reusable point banks and markscheme-derived rubric templates.</p>
          <ButtonLink className="mt-4" href={`/owner/assessments/${id}/rubrics`} variant="secondary">
            Open rubrics
          </ButtonLink>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Paper health</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Check structure, source page ranges, markscheme mapping, delivery readiness, and security assumptions.
          </p>
          <ButtonLink className="mt-4" href={`/owner/assessments/${id}/health`} variant="secondary">
            Run health check
          </ButtonLink>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Markscheme mapping</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Map parsed markscheme sections to the real question tree, excluding covers and general instructions.
          </p>
          <ButtonLink className="mt-4" href={`/owner/assessments/${id}/markscheme`} variant="secondary">
            Open mapper
          </ButtonLink>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Cross-student marking</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Mark the same question across all assigned students without opening each attempt separately.
          </p>
          <ButtonLink className="mt-4" href={`/owner/assessments/${id}/cross-mark`} variant="secondary">
            Cross-mark
          </ButtonLink>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Delete</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Permanently removes this assessment, versions, attempts, responses, parse jobs, reports, and known private
            Storage objects. Owner MFA is required.
          </p>
          <div className="mt-4">
            <DeleteAssessmentButton assessmentId={workspace.assessment.id} title={workspace.assessment.title} />
          </div>
        </Card>
      </div>
    </>
  );
}

async function loadGradingPolicy(assessmentId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("assessment_grading_policies").select("*").eq("assessment_id", assessmentId).maybeSingle();
  if (error) throw error;
  return data as AssessmentGradingPolicy | null;
}
