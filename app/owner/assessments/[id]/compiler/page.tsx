import { createSourceRegionAction } from "@/app/owner/assessments/[id]/authoring/actions";
import { AiParseReviewPanel } from "@/components/owner/ai-parse-review-panel";
import { MineruHostedPanel } from "@/components/owner/mineru-hosted-panel";
import { SectionHeading } from "@/components/section-heading";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getAssessmentAuthoringWorkspace } from "@/lib/examsim/authoring-data";
import { getAssessmentWorkspace } from "@/lib/live-data";

export default async function SmartCompilerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [workspace, parseWorkspace] = await Promise.all([
    getAssessmentAuthoringWorkspace(id),
    getAssessmentWorkspace(id),
  ]);
  const versionId = workspace.latestVersion?.id;
  const parseJobs = parseWorkspace?.parseJobs ?? [];
  const parseArtifacts = parseWorkspace?.parseArtifacts ?? [];
  const lowConfidence = Number(workspace.latestVersion?.parse_confidence ?? 1) < 0.72;
  return (
    <>
      <SectionHeading title="PDF Region Editor" description="Review source PDFs, detected pages, question boxes, confidence warnings, and manual fallback anchors." />
      {!versionId ? <EmptyState title="No PDF import draft" description="Create or upload an assessment source before using the PDF Region Editor." /> : (
        <div className="grid gap-5">
          <Card className="border-blue-100 bg-blue-50/50">
            <h2 className="text-base font-semibold text-blue-950">PDF workflow</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Use this page for PDF source pages and question boxes. If your source is LaTeX, use the LaTeX Compiler. If you
              already have normalized package JSON, use Advanced JSON Review instead of editing raw JSON here.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <ButtonLink href={`/owner/assessments/${id}/latex`} variant="secondary">Open LaTeX Compiler</ButtonLink>
              <ButtonLink href={`/owner/assessments/${id}/review`} variant="secondary">Advanced JSON Review</ButtonLink>
            </div>
          </Card>
          <Card>
            <h2 className="text-base font-semibold text-[var(--ink)]">PDF/OCR provider status</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Hosted MinerU jobs use the server-side MinerU path. DeepSeek suggestions use the
              <code className="mx-1 rounded bg-white px-1 py-0.5 font-mono text-xs">ai-parse-assessment</code>
              Edge Function after source extraction. If there are missing provider credentials, manual question-box review remains available.
            </p>
            <div className="mt-4 grid gap-2 text-sm text-[var(--muted)]">
              <p>Queued job: wait for hosted OCR submission or polling to complete.</p>
              <p>Failed job: inspect the provider message and retry from the MinerU panel.</p>
              <p>Low confidence: {lowConfidence ? "low confidence import detected; review regions before publishing." : "no low confidence warning on this version."}</p>
              <p>Successful draft creation: generated output still opens in Parse Review before it can be published.</p>
            </div>
          </Card>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid gap-5">
              <Card>
                <h2 className="text-base font-semibold text-[var(--ink)]">Source pages</h2>
                <div className="mt-4 grid gap-3">
                  {workspace.sourceDocuments.length ? workspace.sourceDocuments.map((doc) => (
                    <div key={doc.id} className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                      <p className="font-semibold text-[var(--ink)]">{doc.original_file_name ?? doc.document_kind}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">{doc.source_kind} · {doc.status}</p>
                    </div>
                  )) : <p className="text-sm text-[var(--muted)]">No PDF source document records yet. You can still review existing parser output in Advanced JSON Review.</p>}
                </div>
              </Card>
              <MineruHostedPanel parseJobs={parseJobs} artifacts={parseArtifacts} />
              {workspace.latestVersion ? (
                <AiParseReviewPanel version={workspace.latestVersion} nodes={workspace.questionNodes} artifacts={parseArtifacts} />
              ) : null}
            </div>
            <Card>
              <h2 className="text-base font-semibold text-[var(--ink)]">Manual region fallback</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">When OCR or AI confidence is low, add a normalized PDF question box and connect it to a question.</p>
              {workspace.sourceDocuments[0] ? (
                <form action={createSourceRegionAction.bind(null, id, versionId)} className="mt-4 grid gap-3">
                  <input type="hidden" name="source_document_id" value={workspace.sourceDocuments[0].id} />
                  <input name="node_key" placeholder="Q3(a)" className="rounded-[2px] border border-[var(--border)] px-3 py-2 text-sm" />
                  <input name="page_number" type="number" min="1" placeholder="Page" className="rounded-[2px] border border-[var(--border)] px-3 py-2 text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    {["x", "y", "width", "height"].map((name) => (
                      <input key={name} name={name} type="number" step="0.001" min="0" max="1" placeholder={name} className="rounded-[2px] border border-[var(--border)] px-3 py-2 text-sm" />
                    ))}
                  </div>
                  <Button type="submit">Add region</Button>
                </form>
              ) : null}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
