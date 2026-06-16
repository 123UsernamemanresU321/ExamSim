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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAssessmentAuthoringWorkspace } from "@/lib/examsim/authoring-data";

export default async function VisualAuthoringPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getAssessmentAuthoringWorkspace(id);
  const saveAction = updateQuestionCardAction.bind(null, id);
  return (
    <>
      <SectionHeading title="Visual Question Editor" description="Edit question cards, marks, response types, source anchors, and validation details without raw JSON." />
      {!workspace.latestVersion ? (
        <EmptyState title="No version available" description="Upload or import a paper before editing the visual question tree." />
      ) : (
        <div className="grid gap-4">
          {workspace.sourceDocuments.length ? (
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
            <Card>
              <h2 className="text-base font-semibold text-[var(--ink)]">Source-region editor unavailable</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Upload or compile a PDF/LaTeX source first. Once source document records exist, this page shows the interactive
                draggable region editor instead of raw JSON or manual coordinate entry.
              </p>
            </Card>
          )}
          {workspace.questionNodes.map((node) => (
            <Card key={node.id}>
              <form action={saveAction} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_180px_180px_auto]">
                <input type="hidden" name="question_node_id" value={node.id} />
                <div>
                  <p className="font-mono text-xs text-[var(--muted)]">{node.node_key}</p>
                  <input name="title" defaultValue={node.title ?? ""} placeholder={node.display_label ?? node.node_key} className="mt-1 w-full rounded-[2px] border border-[var(--border)] px-3 py-2 text-sm" />
                  <p className="mt-2 line-clamp-2 text-sm text-[var(--muted)]">{stripHtml(node.prompt_html ?? node.prompt_latex ?? "No prompt text")}</p>
                </div>
                <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                  Marks
                  <input name="marks" type="number" min="0" step="0.5" defaultValue={node.marks ?? ""} className="rounded-[2px] border border-[var(--border)] px-3 py-2 text-sm normal-case text-[var(--ink)]" />
                </label>
                <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                  Response
                  <select name="response_mode" defaultValue={node.response_mode} className="rounded-[2px] border border-[var(--border)] bg-white px-3 py-2 text-sm normal-case text-[var(--ink)]">
                    <option value="none">No direct answer</option>
                    <option value="typed_text">Typed text</option>
                    <option value="upload_pdf">PDF upload</option>
                    <option value="typed_or_upload">Typed or upload</option>
                    <option value="multiple_choice">Multiple choice</option>
                    <option value="numerical">Numerical</option>
                  </select>
                </label>
                <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                  Source pages
                  <span className="flex gap-2">
                    <input name="source_page_start" type="number" min="1" defaultValue={node.source_page_start ?? ""} className="w-20 rounded-[2px] border border-[var(--border)] px-2 py-2 text-sm normal-case text-[var(--ink)]" />
                    <input name="source_page_end" type="number" min="1" defaultValue={node.source_page_end ?? ""} className="w-20 rounded-[2px] border border-[var(--border)] px-2 py-2 text-sm normal-case text-[var(--ink)]" />
                  </span>
                </label>
                <div className="flex items-end justify-end gap-2">
                  <StatusBadge status={node.mark_mode ?? "manual"} />
                  <Button type="submit" variant="secondary">Save</Button>
                </div>
              </form>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
