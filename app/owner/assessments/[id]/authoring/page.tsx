import {
  createSourceRegionAction,
  ignoreSourceRegionAction,
  mergeSourceRegionsAction,
  splitSourceRegionAction,
  updateQuestionCardAction,
  updateSourceRegionAction,
} from "@/app/owner/assessments/[id]/authoring/actions";
import { SourceRegionEditor } from "@/components/owner/source-region-editor";
import { SectionHeading } from "@/components/section-heading";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAssessmentAuthoringWorkspace } from "@/lib/examsim/authoring-data";

export default async function VisualAuthoringPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getAssessmentAuthoringWorkspace(id);
  const saveAction = updateQuestionCardAction.bind(null, id);
  const hasSourceDocuments = workspace.sourceDocuments.length > 0;
  return (
    <>
      <SectionHeading title="Visual Question Editor" description="Edit question cards, marks, response types, source anchors, and validation details without raw JSON." />
      {!workspace.latestVersion ? (
        <EmptyState title="No version available" description="Upload or import a paper before editing the visual question tree." />
      ) : (
        <div className="grid gap-5">
          <Card className="border-blue-100 bg-blue-50/50">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-base font-semibold text-blue-950">Build the assessment visually</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-950/80">
                  Use this workspace for normal teacher editing. PDF imports use question boxes and source pages, LaTeX imports use compile/preview,
                  JSON is reserved for advanced import/export, and manual questions can be edited without a linked source document.
                </p>
              </div>
              <StatusBadge status={hasSourceDocuments ? "source linked" : "manual mode"} tone={hasSourceDocuments ? "success" : "info"} />
            </div>
          </Card>

          <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
            <aside className="grid content-start gap-4">
              <Card>
                <h2 className="text-sm font-semibold text-[var(--ink)]">Question list</h2>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Open a question by jumping to its editor card.</p>
                <div className="mt-4 grid gap-1">
                  {workspace.questionNodes.length ? workspace.questionNodes.map((node) => (
                    <a
                      key={node.id}
                      href={`#question-${node.id}`}
                      className="rounded-[2px] border border-transparent px-2 py-2 text-sm hover:border-[var(--border)] hover:bg-[var(--surface-muted)]"
                    >
                      <span className="block font-mono text-xs text-[var(--muted)]">{node.node_key}</span>
                      <span className="mt-0.5 line-clamp-1 block font-semibold text-[var(--ink)]">{node.title || node.display_label || node.node_key}</span>
                    </a>
                  )) : (
                    <p className="text-sm text-[var(--muted)]">No questions have been detected yet.</p>
                  )}
                </div>
              </Card>
            </aside>

            <section className="grid min-w-0 gap-5">
              {hasSourceDocuments ? (
                <SourceRegionEditor
                  versionId={workspace.latestVersion.id}
                  sourceDocuments={workspace.sourceDocuments}
                  sourcePages={workspace.sourcePages}
                  sourceRegions={workspace.sourceRegions}
                  questionNodes={workspace.questionNodes}
                  createRegionAction={createSourceRegionAction.bind(null, id, workspace.latestVersion.id)}
                  updateRegionAction={updateSourceRegionAction.bind(null, id, workspace.latestVersion.id)}
                  ignoreRegionAction={ignoreSourceRegionAction.bind(null, id, workspace.latestVersion.id)}
                  splitRegionAction={splitSourceRegionAction.bind(null, id, workspace.latestVersion.id)}
                  mergeRegionsAction={mergeSourceRegionsAction.bind(null, id, workspace.latestVersion.id)}
                />
              ) : (
                <NoSourceDocumentState assessmentId={id} />
              )}

              <div className="grid gap-4">
                {workspace.questionNodes.length ? workspace.questionNodes.map((node) => (
                  <Card key={node.id} id={`question-${node.id}`}>
                    <form action={saveAction} className="grid gap-5">
                      <input type="hidden" name="question_node_id" value={node.id} />
                      <div className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-[var(--muted)]">{node.node_key}</p>
                          <label className="mt-2 grid gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                            Question number / title
                            <input
                              name="title"
                              defaultValue={node.title ?? ""}
                              placeholder={node.display_label ?? node.node_key}
                              className="rounded-[2px] border border-[var(--border)] px-3 py-2 text-sm normal-case text-[var(--ink)]"
                            />
                          </label>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <StatusBadge status={node.mark_mode ?? "manual"} />
                          <StatusBadge status={node.response_mode ?? "none"} />
                        </div>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Question text</p>
                          <div className="mt-2 min-h-24 rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm leading-6 text-[var(--ink)]">
                            {stripHtml(node.prompt_html ?? node.prompt_latex ?? "") || "No prompt text is stored yet. Use PDF, LaTeX, JSON import, or manual authoring to add question content."}
                          </div>
                        </div>

                        <div className="grid content-start gap-4">
                          <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                            Marks
                            <input name="marks" type="number" min="0" step="0.5" defaultValue={node.marks ?? ""} className="rounded-[2px] border border-[var(--border)] px-3 py-2 text-sm normal-case text-[var(--ink)]" />
                          </label>
                          <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                            Response type
                            <select name="response_mode" defaultValue={node.response_mode} className="rounded-[2px] border border-[var(--border)] bg-white px-3 py-2 text-sm normal-case text-[var(--ink)]">
                              <option value="none">No direct answer</option>
                              <option value="typed_text">Typed text</option>
                              <option value="upload_pdf">PDF upload</option>
                              <option value="typed_or_upload">Typed or upload</option>
                              <option value="multiple_choice">Multiple choice</option>
                              <option value="numerical">Numerical</option>
                            </select>
                          </label>
                        </div>
                      </div>

                      <div className="grid gap-4 border-t border-[var(--border)] pt-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                        {hasSourceDocuments ? (
                          <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                            Source page / region
                            <span className="flex flex-wrap items-center gap-2">
                              <input name="source_page_start" type="number" min="1" defaultValue={node.source_page_start ?? ""} className="w-24 rounded-[2px] border border-[var(--border)] px-2 py-2 text-sm normal-case text-[var(--ink)]" aria-label="Source page start" />
                              <span className="text-xs normal-case text-[var(--muted)]">to</span>
                              <input name="source_page_end" type="number" min="1" defaultValue={node.source_page_end ?? ""} className="w-24 rounded-[2px] border border-[var(--border)] px-2 py-2 text-sm normal-case text-[var(--ink)]" aria-label="Source page end" />
                              <span className="text-xs normal-case text-[var(--muted)]">Question boxes can be adjusted in the PDF Region Editor above.</span>
                            </span>
                          </label>
                        ) : (
                          <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm leading-6 text-[var(--muted)]">
                            No source document is linked, so source page fields are hidden. This question can still be edited and marked manually.
                          </div>
                        )}
                        <div className="flex justify-end">
                          <Button type="submit" variant="secondary">Save question</Button>
                        </div>
                      </div>
                    </form>
                  </Card>
                )) : (
                  <EmptyState title="No question cards yet" description="Import a PDF, compile LaTeX, upload advanced JSON, or add questions through the normal assessment creation flow." />
                )}
              </div>
            </section>

            <aside className="grid content-start gap-4">
              <Card>
                <h2 className="text-sm font-semibold text-[var(--ink)]">Source workflow</h2>
                <div className="mt-4 grid gap-3">
                  <WorkflowLink href={`/owner/assessments/${id}/compiler`} title="PDF Region Editor" copy="Upload or process a PDF, review source pages, and draw question boxes." />
                  <WorkflowLink href={`/owner/assessments/${id}/latex`} title="LaTeX Compiler" copy="Use Examsim syntax with split editor and validation preview." />
                  <WorkflowLink href={`/owner/assessments/${id}/review`} title="Advanced JSON Import" copy="Review normalized JSON and parser warnings. Intended for power users and debugging." />
                </div>
              </Card>

              <Card>
                <h2 className="text-sm font-semibold text-[var(--ink)]">Settings inspector</h2>
                <dl className="mt-4 grid gap-3 text-sm">
                  <InspectorRow label="Source documents" value={String(workspace.sourceDocuments.length)} />
                  <InspectorRow label="Source pages" value={String(workspace.sourcePages.length)} />
                  <InspectorRow label="Question boxes" value={String(workspace.sourceRegions.length)} />
                  <InspectorRow label="Question cards" value={String(workspace.questionNodes.length)} />
                </dl>
                <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
                  Low-confidence source regions should be reviewed before publishing. Raw JSON remains available only through the advanced review path.
                </p>
              </Card>
            </aside>
          </div>
        </div>
      )}
    </>
  );
}

function NoSourceDocumentState({ assessmentId }: { assessmentId: string }) {
  return (
    <Card>
      <h2 className="text-base font-semibold text-[var(--ink)]">No source document linked yet</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
        This assessment can still be authored manually, but diagrams, tables, and PDF page anchors need a source file. Choose the workflow that matches your source.
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <ButtonLink href={`/owner/assessments/${assessmentId}/compiler`} variant="secondary" className="justify-start">Import PDF</ButtonLink>
        <ButtonLink href={`/owner/assessments/${assessmentId}/latex`} variant="secondary" className="justify-start">Import LaTeX</ButtonLink>
        <ButtonLink href={`/owner/assessments/${assessmentId}/review`} variant="secondary" className="justify-start">Advanced JSON Import</ButtonLink>
      </div>
      <div className="mt-4 grid gap-2 text-xs leading-5 text-[var(--muted)]">
        <p><strong className="text-[var(--ink)]">PDF:</strong> use page thumbnails and question boxes to preserve diagrams and layout.</p>
        <p><strong className="text-[var(--ink)]">LaTeX:</strong> compile Examsim syntax such as question marks, answer boxes, topics, and markschemes.</p>
        <p><strong className="text-[var(--ink)]">JSON:</strong> import or debug normalized packages only when you need an advanced escape hatch.</p>
      </div>
    </Card>
  );
}

function WorkflowLink({ href, title, copy }: { href: string; title: string; copy: string }) {
  return (
    <ButtonLink href={href} variant="subtle" className="h-auto justify-start p-3 text-left">
      <span>
        <span className="block text-sm font-semibold text-[var(--ink)]">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{copy}</span>
      </span>
    </ButtonLink>
  );
}

function InspectorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-2 last:border-b-0 last:pb-0">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="font-mono font-semibold text-[var(--ink)]">{value}</dd>
    </div>
  );
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
