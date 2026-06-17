"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import { CheckCircle2, Combine, Copy, CopyPlus, EyeOff, Layers, Move, PanelLeft, PlusCircle, SplitSquareHorizontal, SplitSquareVertical, Trash2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import type { QuestionNodeRow, QuestionSourceRegion, SourceDocument, SourcePage } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type RegionAction = (formData: FormData) => void | Promise<void>;

type Bbox = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  normalized: true;
};

type RegionDraft = {
  id: string;
  question_node_id: string | null;
  source_document_id: string;
  source_page_id: string | null;
  node_key: string | null;
  region_type: QuestionSourceRegion["region_type"];
  status: QuestionSourceRegion["status"];
  confidence: number | null;
  marks: number | null;
  response_mode: QuestionNodeRow["response_mode"] | null;
  notes: string | null;
  bbox: Bbox;
};

type Props = {
  versionId: string;
  sourceDocuments: SourceDocument[];
  sourcePages: SourcePage[];
  sourceRegions: QuestionSourceRegion[];
  questionNodes: QuestionNodeRow[];
  createRegionAction: RegionAction;
  updateRegionAction: RegionAction;
  ignoreRegionAction: RegionAction;
  splitRegionAction: RegionAction;
  mergeRegionsAction: RegionAction;
  duplicateRegionAction: RegionAction;
  deleteRegionAction: RegionAction;
  deleteSourceDocumentAction: RegionAction;
  createQuestionFromRegionAction: RegionAction;
};

type Interaction =
  | { kind: "move"; id: string; startX: number; startY: number; original: Bbox }
  | { kind: "resize"; id: string; startX: number; startY: number; original: Bbox }
  | { kind: "draw"; startX: number; startY: number; startPoint: { x: number; y: number } };

const REGION_TYPES: Array<QuestionSourceRegion["region_type"]> = ["question", "subquestion", "diagram", "table", "answer_area", "markscheme", "instructions", "other"];
const REGION_STATUSES: Array<QuestionSourceRegion["status"]> = ["detected", "needs_review", "approved", "ignored"];
const RESPONSE_MODES: Array<QuestionNodeRow["response_mode"]> = ["none", "typed_text", "upload_pdf", "typed_or_upload", "multiple_choice", "numerical"];

GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();

export function SourceRegionEditor({
  versionId,
  sourceDocuments,
  sourcePages,
  sourceRegions,
  questionNodes,
  createRegionAction,
  updateRegionAction,
  ignoreRegionAction,
  splitRegionAction,
  mergeRegionsAction,
  duplicateRegionAction,
  deleteRegionAction,
  deleteSourceDocumentAction,
  createQuestionFromRegionAction,
}: Props) {
  const [selectedDocumentId, setSelectedDocumentId] = useState(sourceDocuments[0]?.id ?? "");
  const selectedDocument = sourceDocuments.find((document) => document.id === selectedDocumentId) ?? sourceDocuments[0] ?? null;
  const documentPages = useMemo(
    () => sourcePages.filter((page) => page.source_document_id === selectedDocumentId).sort((a, b) => a.page_number - b.page_number),
    [selectedDocumentId, sourcePages],
  );
  const fallbackPages = useMemo(() => {
    if (documentPages.length) return documentPages;
    if (!selectedDocumentId) return [];
    return [{ id: "", source_document_id: selectedDocumentId, page_number: 1, width_points: 595, height_points: 842, image_object_path: null, text_preview: null, metadata_json: {}, created_at: "" } satisfies SourcePage];
  }, [documentPages, selectedDocumentId]);
  const [selectedPageId, setSelectedPageId] = useState(fallbackPages[0]?.id ?? "");
  const selectedPage = fallbackPages.find((page) => page.id === selectedPageId) ?? fallbackPages[0] ?? null;
  const selectedPageNumber = selectedPage?.page_number ?? 1;

  const sourceRegionSignature = sourceRegions.map((region) => `${region.id}:${region.updated_at ?? region.created_at}`).join("|");
  const [draftState, setDraftState] = useState(() => ({
    signature: sourceRegionSignature,
    drafts: sourceRegions.map(toDraft),
  }));
  if (draftState.signature !== sourceRegionSignature) {
    setDraftState({ signature: sourceRegionSignature, drafts: sourceRegions.map(toDraft) });
  }
  const drafts = draftState.signature === sourceRegionSignature ? draftState.drafts : sourceRegions.map(toDraft);
  const setDrafts = useCallback((updater: (current: RegionDraft[]) => RegionDraft[]) => {
    setDraftState((current) => ({ ...current, drafts: updater(current.drafts) }));
  }, []);

  const pageRegions = drafts.filter((region) =>
    region.source_document_id === selectedDocumentId &&
    region.status !== "ignored" &&
    (region.source_page_id ? region.source_page_id === selectedPage?.id : region.bbox.page === selectedPageNumber),
  );
  const lowConfidenceRegions = drafts.filter((region) => region.status !== "ignored" && (region.status === "needs_review" || Number(region.confidence ?? 1) < 0.8));
  const [selectedRegionId, setSelectedRegionId] = useState(pageRegions[0]?.id ?? "");
  const selectedRegion = drafts.find((region) => region.id === selectedRegionId) ?? pageRegions[0] ?? null;
  const pageShellRef = useRef<HTMLDivElement | null>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const [signedPageUrls, setSignedPageUrls] = useState<Record<string, string>>({});
  const [signedDocumentUrls, setSignedDocumentUrls] = useState<Record<string, string>>({});
  const [pdfRenderStatus, setPdfRenderStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [drawDraft, setDrawDraft] = useState<Bbox | null>(null);

  useEffect(() => {
    if (!selectedPage?.image_object_path || signedPageUrls[selectedPage.id]) return;
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    invokeEdgeFunction<{ signed_url: string }>(supabase, "owner-sign-storage-url", {
      body: {
        bucket: "assessment-packages",
        object_path: selectedPage.image_object_path,
        purpose: "parse_artifact",
        expires_in_seconds: 600,
      },
      requiresAal2: true,
    })
      .then((result) => {
        if (!cancelled && result?.signed_url) setSignedPageUrls((current) => ({ ...current, [selectedPage.id]: result.signed_url }));
      })
      .catch(() => {
        if (!cancelled) setSignedPageUrls((current) => ({ ...current, [selectedPage.id]: "" }));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPage, signedPageUrls]);

  useEffect(() => {
    if (!selectedDocument?.object_path || signedDocumentUrls[selectedDocument.id]) return;
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    invokeEdgeFunction<{ signed_url: string }>(supabase, "owner-sign-storage-url", {
      body: {
        bucket: "assessment-sources",
        object_path: selectedDocument.object_path,
        purpose: "assessment_source",
        expires_in_seconds: 600,
      },
      requiresAal2: true,
    })
      .then((result) => {
        if (!cancelled && result?.signed_url) setSignedDocumentUrls((current) => ({ ...current, [selectedDocument.id]: result.signed_url }));
      })
      .catch(() => {
        if (!cancelled) setSignedDocumentUrls((current) => ({ ...current, [selectedDocument.id]: "" }));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDocument, signedDocumentUrls]);

  const selectedDocumentUrl = selectedDocument?.id ? signedDocumentUrls[selectedDocument.id] : "";
  const selectedPageUrl = selectedPage?.id ? signedPageUrls[selectedPage.id] : "";

  useEffect(() => {
    if (!selectedDocumentUrl || !selectedPage || selectedPageUrl || !pdfCanvasRef.current) return;
    let cancelled = false;
    let renderTask: { cancel?: () => void; promise?: Promise<unknown> } | null = null;
    setPdfRenderStatus("loading");

    async function renderPdfPage() {
      const canvas = pdfCanvasRef.current;
      if (!canvas) return;
      const pdf = await getDocument({ url: selectedDocumentUrl }).promise;
      const page = await pdf.getPage(selectedPageNumber);
      const viewport = page.getViewport({ scale: 1.7 });
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare PDF canvas.");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      renderTask = page.render({ canvas, canvasContext: context, viewport }) as { cancel?: () => void; promise?: Promise<unknown> };
      await renderTask.promise;
      if (!cancelled) setPdfRenderStatus("ready");
    }

    renderPdfPage().catch(() => {
      if (!cancelled) setPdfRenderStatus("error");
    });
    return () => {
      cancelled = true;
      renderTask?.cancel?.();
    };
  }, [selectedDocumentUrl, selectedPage, selectedPageNumber, selectedPageUrl]);

  const setDraftBbox = useCallback((id: string, bbox: Bbox) => {
    setDrafts((current) => current.map((region) => region.id === id ? { ...region, bbox } : region));
  }, [setDrafts]);

  const pointerToDelta = useCallback((event: PointerEvent | React.PointerEvent) => {
    const rect = pageShellRef.current?.getBoundingClientRect();
    if (!rect) return { dx: 0, dy: 0 };
    const interaction = interactionRef.current;
    if (!interaction) return { dx: 0, dy: 0 };
    return {
      dx: (event.clientX - interaction.startX) / rect.width,
      dy: (event.clientY - interaction.startY) / rect.height,
    };
  }, []);

  const pointerToPoint = useCallback((event: PointerEvent | React.PointerEvent) => {
    const rect = pageShellRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };
  }, []);

  const buildDrawBbox = useCallback((event: PointerEvent | React.PointerEvent, interaction: Extract<Interaction, { kind: "draw" }>) => {
    const point = pointerToPoint(event);
    const x = Math.min(interaction.startPoint.x, point.x);
    const y = Math.min(interaction.startPoint.y, point.y);
    const width = Math.max(0.01, Math.abs(point.x - interaction.startPoint.x));
    const height = Math.max(0.01, Math.abs(point.y - interaction.startPoint.y));
    return {
      page: selectedPageNumber,
      x,
      y,
      width: Math.min(width, 1 - x),
      height: Math.min(height, 1 - y),
      normalized: true,
    } satisfies Bbox;
  }, [pointerToPoint, selectedPageNumber]);

  const beginDraw = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !selectedDocumentId) return;
    if ((event.target as HTMLElement).closest("[data-region-box]")) return;
    event.preventDefault();
    const startPoint = pointerToPoint(event);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    interactionRef.current = { kind: "draw", startX: event.clientX, startY: event.clientY, startPoint };
    setDrawDraft({
      page: selectedPageNumber,
      x: startPoint.x,
      y: startPoint.y,
      width: 0.01,
      height: 0.01,
      normalized: true,
    });
  }, [pointerToPoint, selectedDocumentId, selectedPageNumber]);

  const beginInteraction = useCallback((event: React.PointerEvent, id: string, kind: "move" | "resize") => {
    const region = drafts.find((draft) => draft.id === id);
    if (!region) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedRegionId(id);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    interactionRef.current = { kind, id, startX: event.clientX, startY: event.clientY, original: region.bbox };
  }, [drafts]);

  const updateInteraction = useCallback((event: React.PointerEvent) => {
    const interaction = interactionRef.current;
    if (!interaction) return;
    event.preventDefault();
    if (interaction.kind === "draw") {
      setDrawDraft(buildDrawBbox(event, interaction));
      return;
    }
    const { dx, dy } = pointerToDelta(event);
    if (interaction.kind === "move") {
      const x = clamp(interaction.original.x + dx, 0, 1 - interaction.original.width);
      const y = clamp(interaction.original.y + dy, 0, 1 - interaction.original.height);
      setDraftBbox(interaction.id, { ...interaction.original, x, y });
    } else {
      const width = clamp(interaction.original.width + dx, 0.03, 1 - interaction.original.x);
      const height = clamp(interaction.original.height + dy, 0.03, 1 - interaction.original.y);
      setDraftBbox(interaction.id, { ...interaction.original, width, height });
    }
  }, [buildDrawBbox, pointerToDelta, setDraftBbox]);

  const endInteraction = useCallback((event: React.PointerEvent) => {
    const interaction = interactionRef.current;
    if (!interaction) return;
    event.preventDefault();
    if (interaction.kind === "draw") {
      const bbox = buildDrawBbox(event, interaction);
      setDrawDraft(null);
      if (bbox.width >= 0.02 && bbox.height >= 0.02 && selectedDocumentId) {
        const formData = new FormData();
        formData.set("source_document_id", selectedDocumentId);
        formData.set("source_page_id", selectedPage?.id ?? "");
        formData.set("page_number", String(selectedPageNumber));
        formData.set("x", String(bbox.x));
        formData.set("y", String(bbox.y));
        formData.set("width", String(bbox.width));
        formData.set("height", String(bbox.height));
        formData.set("region_type", "question");
        void createRegionAction(formData);
      }
    }
    interactionRef.current = null;
  }, [buildDrawBbox, createRegionAction, selectedDocumentId, selectedPage?.id, selectedPageNumber]);

  const aspectRatio = `${selectedPage?.width_points ?? 595} / ${selectedPage?.height_points ?? 842}`;

  return (
    <Card id="pdf-region-editor" className="p-0">
      <div className="grid min-h-[680px] lg:grid-cols-[220px_minmax(0,1fr)_320px]">
        <aside className="border-b border-[var(--border)] bg-[var(--surface-muted)] p-4 lg:border-b-0 lg:border-r">
          <CardHeader className="mb-3">
            <CardTitle className="flex items-center gap-2 text-sm"><PanelLeft size={15} /> Source pages</CardTitle>
            <CardDescription className="text-xs">Select a page, then draw or adjust normalized regions.</CardDescription>
          </CardHeader>
          <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Document
            <select
              value={selectedDocumentId}
              onChange={(event) => {
                const nextDocumentId = event.target.value;
                setSelectedDocumentId(nextDocumentId);
                const nextPage = sourcePages
                  .filter((page) => page.source_document_id === nextDocumentId)
                  .sort((a, b) => a.page_number - b.page_number)[0];
                setSelectedPageId(nextPage?.id ?? "");
              }}
              className="rounded-[2px] border border-[var(--border)] bg-white px-2 py-2 text-sm normal-case text-[var(--ink)]"
            >
              {sourceDocuments.map((doc) => <option key={doc.id} value={doc.id}>{doc.original_file_name ?? doc.document_kind}</option>)}
            </select>
          </label>
          <div className="mt-4 grid gap-2">
            {fallbackPages.map((page) => {
              const active = page.id === selectedPage?.id;
              const count = drafts.filter((region) => region.source_document_id === selectedDocumentId && region.status !== "ignored" && (region.source_page_id ? region.source_page_id === page.id : region.bbox.page === page.page_number)).length;
              return (
                <button
                  key={page.id || `page-${page.page_number}`}
                  type="button"
                  onClick={() => setSelectedPageId(page.id)}
                  className={cn(
                    "rounded-[4px] border px-3 py-2 text-left text-sm transition-colors",
                    active ? "border-[var(--primary)] bg-white text-[var(--ink)] shadow-[var(--shadow-card)]" : "border-[var(--border)] bg-white/70 text-[var(--muted)] hover:bg-white",
                  )}
                >
                  <span className="font-semibold">Page {page.page_number}</span>
                  <span className="mt-1 block text-xs">{count} region{count === 1 ? "" : "s"}</span>
                </button>
              );
            })}
          </div>
          <form action={createRegionAction} className="mt-4">
            <input type="hidden" name="source_document_id" value={selectedDocumentId} />
            <input type="hidden" name="source_page_id" value={selectedPage?.id ?? ""} />
            <input type="hidden" name="page_number" value={selectedPageNumber} />
            <input type="hidden" name="x" value="0.08" />
            <input type="hidden" name="y" value="0.08" />
            <input type="hidden" name="width" value="0.42" />
            <input type="hidden" name="height" value="0.18" />
            <input type="hidden" name="region_type" value="question" />
            <Button type="submit" variant="secondary" className="w-full"><CopyPlus size={14} /> Add region</Button>
          </form>
          {selectedDocument ? (
            <form
              action={deleteSourceDocumentAction}
              onSubmit={(event) => {
                if (!window.confirm("Delete this source PDF and all page region boxes linked to it? This cannot be undone.")) {
                  event.preventDefault();
                }
              }}
              className="mt-3 rounded-[4px] border border-[var(--danger)]/20 bg-[var(--danger-bg)] p-3"
            >
              <input type="hidden" name="source_document_id" value={selectedDocument.id} />
              <p className="text-xs leading-5 text-[var(--danger)]">
                Delete source PDF removes its page records and region boxes. Upload another PDF first if this is a replacement.
              </p>
              <Button type="submit" variant="dangerSubtle" className="mt-2 w-full"><Trash2 size={14} /> Delete source PDF</Button>
            </form>
          ) : null}
        </aside>

        <section className="min-w-0 bg-slate-100 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-[var(--ink)]">PDF Region Editor</h2>
              <p className="text-sm text-[var(--muted)]">Draw, drag, resize, split, merge, and link normalized question boxes on the actual PDF page.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="info">v{versionId.slice(0, 8)}</Badge>
              <Badge tone={lowConfidenceRegions.length ? "warning" : "success"}>{lowConfidenceRegions.length} review item{lowConfidenceRegions.length === 1 ? "" : "s"}</Badge>
            </div>
          </div>
          <div
            ref={pageShellRef}
            className="relative mx-auto max-h-[840px] max-w-[760px] overflow-hidden rounded-[4px] border border-[var(--border)] bg-white shadow-[var(--shadow-card)] select-none"
            style={{ aspectRatio }}
            onPointerDown={beginDraw}
            onPointerMove={updateInteraction}
            onPointerUp={endInteraction}
            onPointerCancel={endInteraction}
          >
            {selectedPageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedPageUrl} alt={`Source page ${selectedPageNumber}`} draggable={false} className="absolute inset-0 h-full w-full object-contain pointer-events-none" />
            ) : selectedDocumentUrl ? (
              <>
                <canvas
                  ref={pdfCanvasRef}
                  aria-label={`Rendered PDF source page ${selectedPageNumber}`}
                  className="absolute inset-0 h-full w-full object-contain pointer-events-none"
                />
                {pdfRenderStatus === "loading" ? (
                  <div className="absolute inset-x-0 top-0 bg-white/80 px-3 py-2 text-xs font-semibold text-[var(--muted)]">Rendering PDF page...</div>
                ) : null}
                {pdfRenderStatus === "error" ? (
                  <div className="absolute inset-0 grid place-items-center bg-white/85 px-6 text-center text-sm text-[var(--danger)]">
                    Could not render this PDF page. Region coordinates can still be saved; try reloading or replacing the source PDF.
                  </div>
                ) : null}
              </>
            ) : (
              <div className="absolute inset-0 grid bg-[linear-gradient(#f8fafc_1px,transparent_1px),linear-gradient(90deg,#f8fafc_1px,transparent_1px)] bg-[length:28px_28px]">
                <div className="m-auto max-w-md px-6 text-center">
                  <Layers className="mx-auto text-slate-400" size={34} />
                  <p className="mt-3 text-sm font-semibold text-[var(--ink)]">Source page preview unavailable</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Regions are still stored in normalized page coordinates. The PDF signed URL could not be loaded.</p>
                  {selectedPage?.text_preview ? <p className="mt-4 line-clamp-6 text-left text-xs leading-5 text-slate-500">{selectedPage.text_preview}</p> : null}
                </div>
              </div>
            )}
            {pageRegions.map((region) => (
              <button
                key={region.id}
                data-region-box="true"
                type="button"
                onClick={() => setSelectedRegionId(region.id)}
                onPointerDown={(event) => beginInteraction(event, region.id, "move")}
                className={cn(
                  "absolute touch-none border-2 bg-blue-500/10 text-left shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
                  selectedRegion?.id === region.id ? "border-[var(--primary)]" : "border-amber-500",
                )}
                style={{
                  left: `${region.bbox.x * 100}%`,
                  top: `${region.bbox.y * 100}%`,
                  width: `${region.bbox.width * 100}%`,
                  height: `${region.bbox.height * 100}%`,
                }}
                title={region.node_key ?? region.region_type}
              >
                <span className="absolute left-1 top-1 rounded-[2px] bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-800 shadow-sm">
                  {region.node_key ?? region.region_type}
                </span>
                <span
                  role="presentation"
                  onPointerDown={(event) => beginInteraction(event, region.id, "resize")}
                  className="absolute bottom-0 right-0 h-4 w-4 translate-x-1 translate-y-1 cursor-nwse-resize rounded-sm border border-white bg-[var(--primary)]"
                />
              </button>
            ))}
            {drawDraft ? (
              <div
                aria-hidden="true"
                className="absolute border-2 border-dashed border-[var(--primary)] bg-blue-500/10"
                style={{
                  left: `${drawDraft.x * 100}%`,
                  top: `${drawDraft.y * 100}%`,
                  width: `${drawDraft.width * 100}%`,
                  height: `${drawDraft.height * 100}%`,
                }}
              />
            ) : null}
          </div>
        </section>

        <aside className="border-t border-[var(--border)] bg-white p-4 lg:border-l lg:border-t-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm"><Move size={15} /> Selected region</CardTitle>
            <CardDescription className="text-xs">Assign the box to a question, mark it approved, or split/merge it.</CardDescription>
          </CardHeader>
          {selectedRegion ? (
            <div className="grid gap-4">
              <form action={updateRegionAction} className="grid gap-3">
                <input type="hidden" name="region_id" value={selectedRegion.id} />
                <input type="hidden" name="source_page_id" value={selectedPage?.id ?? ""} />
                <input type="hidden" name="page_number" value={selectedRegion.bbox.page} />
                <input type="hidden" name="x" value={selectedRegion.bbox.x} />
                <input type="hidden" name="y" value={selectedRegion.bbox.y} />
                <input type="hidden" name="width" value={selectedRegion.bbox.width} />
                <input type="hidden" name="height" value={selectedRegion.bbox.height} />
                <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                  Question
                  <select name="question_node_id" defaultValue={selectedRegion.question_node_id ?? ""} className="rounded-[2px] border border-[var(--border)] bg-white px-2 py-2 text-sm normal-case text-[var(--ink)]">
                    <option value="">Unassigned</option>
                    {questionNodes.map((node) => <option key={node.id} value={node.id}>{node.display_label ?? node.node_key}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                  Label
                  <input name="node_key" defaultValue={selectedRegion.node_key ?? ""} className="rounded-[2px] border border-[var(--border)] px-2 py-2 text-sm normal-case text-[var(--ink)]" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                    Marks
                    <input name="marks" type="number" min="0" step="0.5" defaultValue={selectedRegion.marks ?? ""} className="rounded-[2px] border border-[var(--border)] px-2 py-2 text-sm normal-case text-[var(--ink)]" />
                  </label>
                  <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                    Response type
                    <select name="response_mode" defaultValue={selectedRegion.response_mode ?? ""} className="rounded-[2px] border border-[var(--border)] bg-white px-2 py-2 text-sm normal-case text-[var(--ink)]">
                      <option value="">Use linked question</option>
                      {RESPONSE_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                    </select>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                    Type
                    <select name="region_type" defaultValue={selectedRegion.region_type} className="rounded-[2px] border border-[var(--border)] bg-white px-2 py-2 text-sm normal-case text-[var(--ink)]">
                      {REGION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                    Status
                    <select name="status" defaultValue={selectedRegion.status} className="rounded-[2px] border border-[var(--border)] bg-white px-2 py-2 text-sm normal-case text-[var(--ink)]">
                      {REGION_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                </div>
                <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                  Confidence
                  <input name="confidence" type="number" min="0" max="1" step="0.01" defaultValue={selectedRegion.confidence ?? 0.5} className="rounded-[2px] border border-[var(--border)] px-2 py-2 text-sm normal-case text-[var(--ink)]" />
                </label>
                <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                  Notes
                  <textarea name="notes" defaultValue={selectedRegion.notes ?? ""} rows={3} className="rounded-[2px] border border-[var(--border)] px-2 py-2 text-sm normal-case text-[var(--ink)]" />
                </label>
                <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 font-mono text-[11px] text-slate-600">
                  x {selectedRegion.bbox.x.toFixed(3)} · y {selectedRegion.bbox.y.toFixed(3)} · w {selectedRegion.bbox.width.toFixed(3)} · h {selectedRegion.bbox.height.toFixed(3)}
                </div>
                <RegionSubmitButton />
              </form>

              {!selectedRegion.question_node_id ? (
                <form action={createQuestionFromRegionAction} className="grid gap-2 rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                  <input type="hidden" name="region_id" value={selectedRegion.id} />
                  <input type="hidden" name="node_key" value={selectedRegion.node_key ?? ""} />
                  <p className="text-xs leading-5 text-[var(--muted)]">Create a new editable question card from this region if no matching question exists yet.</p>
                  <Button type="submit" variant="secondary"><PlusCircle size={14} /> Create question card</Button>
                </form>
              ) : (
                <a href={`#question-${selectedRegion.question_node_id}`} className="inline-flex text-xs font-semibold text-[var(--primary)] underline">
                  Open linked question card
                </a>
              )}

              <div className="grid grid-cols-2 gap-2">
                <form action={splitRegionAction}>
                  <input type="hidden" name="region_id" value={selectedRegion.id} />
                  <input type="hidden" name="axis" value="vertical" />
                  <Button type="submit" variant="secondary" className="w-full"><SplitSquareVertical size={14} /> Split V</Button>
                </form>
                <form action={splitRegionAction}>
                  <input type="hidden" name="region_id" value={selectedRegion.id} />
                  <input type="hidden" name="axis" value="horizontal" />
                  <Button type="submit" variant="secondary" className="w-full"><SplitSquareHorizontal size={14} /> Split H</Button>
                </form>
              </div>

              <form action={mergeRegionsAction} className="grid gap-2">
                <input type="hidden" name="primary_region_id" value={selectedRegion.id} />
                <select name="secondary_region_id" className="rounded-[2px] border border-[var(--border)] bg-white px-2 py-2 text-sm text-[var(--ink)]">
                  <option value="">Merge with...</option>
                  {pageRegions.filter((region) => region.id !== selectedRegion.id).map((region) => (
                    <option key={region.id} value={region.id}>{region.node_key ?? region.region_type}</option>
                  ))}
                </select>
                <Button type="submit" variant="secondary"><Combine size={14} /> Merge regions</Button>
              </form>

              <div className="grid grid-cols-2 gap-2">
                <form action={duplicateRegionAction}>
                  <input type="hidden" name="region_id" value={selectedRegion.id} />
                  <Button type="submit" variant="secondary" className="w-full"><Copy size={14} /> Duplicate region</Button>
                </form>
                <form action={deleteRegionAction}>
                  <input type="hidden" name="region_id" value={selectedRegion.id} />
                  <Button type="submit" variant="dangerSubtle" className="w-full"><Trash2 size={14} /> Delete region</Button>
                </form>
              </div>

              <form action={ignoreRegionAction}>
                <input type="hidden" name="region_id" value={selectedRegion.id} />
                <Button type="submit" variant="dangerSubtle" className="w-full"><EyeOff size={14} /> Ignore region</Button>
              </form>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">Select or add a region to edit its source anchor.</p>
          )}

          <div className="mt-6 border-t border-[var(--border)] pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Review queue</h3>
            <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto pr-1">
              {lowConfidenceRegions.length ? lowConfidenceRegions.map((region) => (
                <button
                  key={region.id}
                  type="button"
                  onClick={() => {
                    setSelectedDocumentId(region.source_document_id);
                    if (region.source_page_id) setSelectedPageId(region.source_page_id);
                    setSelectedRegionId(region.id);
                  }}
                  className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-left text-xs text-[var(--muted)] hover:bg-white"
                >
                  <span className="block font-semibold text-[var(--ink)]">{region.node_key ?? region.region_type}</span>
                  <span>{region.status} · {Math.round(Number(region.confidence ?? 0) * 100)}%</span>
                </button>
              )) : <p className="text-sm text-[var(--muted)]">No low-confidence regions.</p>}
            </div>
          </div>
        </aside>
      </div>
    </Card>
  );
}

function toDraft(region: QuestionSourceRegion): RegionDraft {
  const metadata = safeRecord(region.metadata_json);
  const responseMode = typeof metadata.response_mode === "string" && RESPONSE_MODES.includes(metadata.response_mode as QuestionNodeRow["response_mode"])
    ? metadata.response_mode as QuestionNodeRow["response_mode"]
    : null;
  const marks = Number(metadata.marks ?? NaN);
  return {
    id: region.id,
    question_node_id: region.question_node_id,
    source_document_id: region.source_document_id,
    source_page_id: region.source_page_id,
    node_key: region.node_key,
    region_type: region.region_type,
    status: region.status,
    confidence: region.confidence,
    marks: Number.isFinite(marks) ? marks : null,
    response_mode: responseMode,
    notes: typeof metadata.notes === "string" ? metadata.notes : null,
    bbox: parseBbox(region.bbox_json),
  };
}

function parseBbox(value: unknown): Bbox {
  const source = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const x = clamp(Number(source.x ?? 0), 0, 1);
  const y = clamp(Number(source.y ?? 0), 0, 1);
  const width = clamp(Number(source.width ?? 1), 0.03, 1 - x);
  const height = clamp(Number(source.height ?? 1), 0.03, 1 - y);
  return {
    page: Math.max(1, Math.floor(Number(source.page ?? 1) || 1)),
    x,
    y,
    width,
    height,
    normalized: true,
  };
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function safeRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function RegionSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <CheckCircle2 size={14} />
      {pending ? "Saving..." : "Save selected"}
    </Button>
  );
}
