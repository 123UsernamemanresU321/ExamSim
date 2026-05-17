"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Maximize2, X } from "lucide-react";
import { AnnotationListPanel } from "@/components/owner/annotation-list-panel";
import { AnnotationPropertiesPanel } from "@/components/owner/annotation-properties-panel";
import { AnnotationToolbar } from "@/components/owner/annotation-toolbar";
import { PageThumbnailSidebar } from "@/components/owner/page-thumbnail-sidebar";
import { PdfAnnotationPage, type PdfAnnotationPageInfo } from "@/components/owner/pdf-annotation-page";
import { ReleaseAnnotatedPdfDialog } from "@/components/owner/release-annotated-pdf-dialog";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import {
  anchorForAnnotation,
  annotationBody,
  annotationFromWorkAnnotation,
  type AnnotationTool,
  type PdfAnnotation,
} from "@/lib/annotation-model";
import { cn } from "@/lib/utils";
import type { QuestionNodeRow, TextResponse, UploadSlot, WorkAnnotation } from "@/types/database";

type SaveStatus = "saved" | "unsaved" | "saving" | "failed";

function workAnnotationsSourceKey(annotations: WorkAnnotation[]) {
  return annotations
    .map((annotation) => `${annotation.id}:${annotation.updated_at}`)
    .sort()
    .join("|");
}

export function WorkAnnotationStudio({
  attemptId,
  node,
  response,
  slot,
  annotations,
  studentName = "Student",
  assessmentTitle = "Assessment",
  paperCode,
  releaseStatus = "Draft",
}: {
  attemptId: string;
  node: QuestionNodeRow;
  response?: TextResponse;
  slot?: UploadSlot;
  annotations: WorkAnnotation[];
  studentName?: string;
  assessmentTitle?: string;
  paperCode?: string | null;
  releaseStatus?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<AnnotationTool>("select");
  const [selectedPageIndex, setSelectedPageIndex] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [zoom, setZoom] = useState(1.15);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [studioAnnotations, setStudioAnnotations] = useState<PdfAnnotation[]>(() => annotations.map(annotationFromWorkAnnotation));
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [privateNotes, setPrivateNotes] = useState("");
  const [studentFeedback, setStudentFeedback] = useState("");
  const [releaseDialogOpen, setReleaseDialogOpen] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [history, setHistory] = useState<PdfAnnotation[][]>([]);
  const [future, setFuture] = useState<PdfAnnotation[][]>([]);
  const pageInfoByIndex = useRef<Record<number, PdfAnnotationPageInfo>>({});
  const autosaveTimer = useRef<number | null>(null);
  const syncedAnnotationsSourceKeyRef = useRef<string | null>(null);

  const annotationKind = slot?.object_path ? "uploaded_pdf" : response?.answer_text ? "typed_text" : "general";
  const annotationsSourceKey = workAnnotationsSourceKey(annotations);
  const dirtyCount = dirtyIds.size;
  const deletedCount = deletedIds.size;
  const selectedAnnotation = studioAnnotations.find((annotation) => annotation.id === selectedAnnotationId) ?? null;
  const currentPageAnnotations = studioAnnotations.filter((annotation) => annotation.page_index === selectedPageIndex);
  const saveBadge = saveStatus === "failed" ? "Save failed" : saveStatus === "saving" ? "Saving..." : saveStatus === "unsaved" ? "Unsaved" : "Saved";
  const markSummary = node.marks ? `${node.marks} available marks for ${node.node_key}` : `${node.node_key} has no configured marks`;

  useEffect(() => {
    if (!open) {
      syncedAnnotationsSourceKeyRef.current = null;
      return;
    }
    if (isInteracting || dirtyCount || deletedCount) return;
    if (syncedAnnotationsSourceKeyRef.current === annotationsSourceKey) return;
    const id = window.setTimeout(() => {
      setStudioAnnotations(annotations.map(annotationFromWorkAnnotation));
      setDirtyIds(new Set());
      setDeletedIds(new Set());
      setSaveStatus("saved");
      syncedAnnotationsSourceKeyRef.current = annotationsSourceKey;
    }, 0);
    return () => window.clearTimeout(id);
  }, [annotations, annotationsSourceKey, deletedCount, dirtyCount, isInteracting, open]);

  useEffect(() => {
    if (!open) return;
    document.documentElement.dataset.annotationStudioOpen = "true";
    return () => {
      delete document.documentElement.dataset.annotationStudioOpen;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !slot?.object_path) return;
    const objectPath = slot.object_path;
    let cancelled = false;
    async function signPdf() {
      setSignError(null);
      try {
        const supabase = createSupabaseBrowserClient();
        const data = await invokeEdgeFunction<{ signed_url: string }>(supabase, "owner-sign-storage-url", {
          body: { bucket: "answer-uploads", object_path: objectPath, purpose: "answer_upload", expires_in_seconds: 300 },
          requiresAal2: true,
        });
        if (!data?.signed_url) throw new Error("Could not generate PDF preview link.");
        if (!cancelled) setSignedUrl(data.signed_url);
      } catch (error) {
        if (!cancelled) setSignError(error instanceof Error ? error.message : "Could not preview PDF.");
      }
    }
    void signPdf();
    return () => {
      cancelled = true;
    };
  }, [open, slot?.object_path]);

  const saveDraft = useCallback(async () => {
    if (!dirtyIds.size && !deletedIds.size) return;
    setSaveStatus("saving");
    try {
      const supabase = createSupabaseBrowserClient();
      for (const annotationId of deletedIds) {
        await invokeEdgeFunction(supabase, "save-work-annotation", {
          body: {
            attempt_id: attemptId,
            question_node_id: node.id,
            annotation_id: annotationId,
            annotation_kind: annotationKind,
            delete: true,
          },
          requiresAal2: true,
        });
      }

      const persistedIdByTempId = new Map<string, string>();
      for (const annotation of studioAnnotations.filter((item) => dirtyIds.has(item.id))) {
        const pageInfo = pageInfoByIndex.current[annotation.page_index];
        const data = await invokeEdgeFunction<{ annotation: WorkAnnotation }>(supabase, "save-work-annotation", {
          body: {
            attempt_id: attemptId,
            question_node_id: node.id,
            upload_slot_id: slot?.id ?? null,
            text_response_id: response?.id ?? null,
            annotation_id: annotation.persistedId ?? null,
            annotation_kind: annotationKind,
            visibility: annotation.visibility,
            severity: annotation.severity,
            body: annotationBody(annotation),
            anchor_json: anchorForAnnotation(annotation, pageInfo ? { width: pageInfo.pdfWidth, height: pageInfo.pdfHeight } : null),
          },
          requiresAal2: true,
        });
        if (data?.annotation?.id && !annotation.persistedId) persistedIdByTempId.set(annotation.id, data.annotation.id);
      }

      if (persistedIdByTempId.size) {
        setStudioAnnotations((current) =>
          current.map((annotation) => {
            const persistedId = persistedIdByTempId.get(annotation.id);
            return persistedId ? { ...annotation, id: persistedId, persistedId } : annotation;
          }),
        );
        setSelectedAnnotationId((current) => (current ? persistedIdByTempId.get(current) ?? current : current));
      }
      setDirtyIds(new Set());
      setDeletedIds(new Set());
      setSaveStatus("saved");
    } catch (error) {
      console.error("Annotation autosave failed", error);
      setSaveStatus("failed");
    }
  }, [annotationKind, attemptId, dirtyIds, deletedIds, node.id, response, slot, studioAnnotations]);

  useEffect(() => {
    if (!open || isInteracting || (!dirtyIds.size && !deletedIds.size)) return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      void saveDraft();
    }, 1200);
    return () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    };
  }, [deletedIds, dirtyIds, isInteracting, open, saveDraft]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (selectedAnnotationId) setSelectedAnnotationId(null);
        else setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, selectedAnnotationId]);

  function commitAnnotations(next: PdfAnnotation[]) {
    setHistory((current) => [...current.slice(-30), studioAnnotations]);
    setFuture([]);
    setStudioAnnotations(next);
  }

  function markDirty(annotation: PdfAnnotation) {
    setSaveStatus("unsaved");
    setDirtyIds((current) => new Set(current).add(annotation.id));
  }

  function handleCreateAnnotation(annotation: PdfAnnotation) {
    commitAnnotations([...studioAnnotations, annotation]);
    markDirty(annotation);
  }

  function handleUpdateAnnotation(annotation: PdfAnnotation) {
    setHistory((current) => [...current.slice(-30), studioAnnotations]);
    setFuture([]);
    setStudioAnnotations((current) => current.map((item) => (item.id === annotation.id ? annotation : item)));
    markDirty(annotation);
  }

  function handleDeleteAnnotation(annotationId: string) {
    const annotation = studioAnnotations.find((item) => item.id === annotationId);
    if (!annotation) return;
    commitAnnotations(studioAnnotations.filter((item) => item.id !== annotationId));
    setSaveStatus("unsaved");
    setDirtyIds((current) => {
      const next = new Set(current);
      next.delete(annotationId);
      return next;
    });
    if (annotation.persistedId) setDeletedIds((current) => new Set(current).add(annotation.persistedId!));
    if (selectedAnnotationId === annotationId) setSelectedAnnotationId(null);
  }

  function handleUndo() {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((current) => [studioAnnotations, ...current]);
    setHistory((current) => current.slice(0, -1));
    setStudioAnnotations(previous);
    setDirtyIds(new Set(previous.map((annotation) => annotation.id)));
    setSaveStatus("unsaved");
  }

  function handleRedo() {
    const next = future[0];
    if (!next) return;
    setHistory((current) => [...current, studioAnnotations]);
    setFuture((current) => current.slice(1));
    setStudioAnnotations(next);
    setDirtyIds(new Set(next.map((annotation) => annotation.id)));
    setSaveStatus("unsaved");
  }

  function handlePageInfo(info: PdfAnnotationPageInfo & { totalPages: number }) {
    pageInfoByIndex.current[info.pageIndex] = info;
    setTotalPages(info.totalPages);
  }

  function closeStudio() {
    setOpen(false);
    router.refresh();
  }

  async function generateAnnotatedPdf() {
    if (!slot?.id || !slot.object_path) {
      alert("Annotated PDF generation is available for uploaded PDF responses.");
      return;
    }
    await saveDraft();
    try {
      setSaveStatus("saving");
      const supabase = createSupabaseBrowserClient();
      const data = await invokeEdgeFunction<{ signed_url: string; object_path: string }>(supabase, "generate-annotated-pdf", {
        body: {
          attempt_id: attemptId,
          question_node_id: node.id,
          upload_slot_id: slot.id,
          annotations: studioAnnotations.filter((annotation) => annotation.page_index >= 0),
        },
        requiresAal2: true,
      });
      setSaveStatus("saved");
      if (data?.signed_url) window.open(data.signed_url, "_blank", "noopener,noreferrer");
      router.refresh();
    } catch (error) {
      setSaveStatus("failed");
      alert(error instanceof Error ? error.message : "Could not generate annotated PDF.");
    }
  }

  async function releaseToStudent() {
    setIsReleasing(true);
    try {
      await saveDraft();
      const supabase = createSupabaseBrowserClient();
      await invokeEdgeFunction(supabase, "release-feedback", {
        body: {
          attempt_id: attemptId,
          summary_text: studentFeedback.trim() || undefined,
          visible_to_student: true,
        },
        requiresAal2: true,
      });
      setReleaseDialogOpen(false);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not release feedback.");
    } finally {
      setIsReleasing(false);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" className="text-xs" onClick={() => setOpen(true)}>
        <Maximize2 size={14} /> Open annotation studio
      </Button>
      {open ? (
        <div
          className="annotation-studio fixed inset-0 z-50 bg-slate-950/80 p-3 text-[var(--ink)] backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Annotation studio for ${node.node_key}`}
          style={{ userSelect: "none", WebkitUserSelect: "none" }}
        >
          <span className="hidden">annotation-v2</span>
          <div className="grid h-full grid-rows-[auto_auto_1fr] overflow-hidden rounded-xl border border-slate-700 bg-slate-100 shadow-2xl">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Annotation Studio</p>
                <h2 className="truncate text-lg font-black text-slate-950">
                  {studentName} · {assessmentTitle}
                </h2>
                <p className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                  <span>{paperCode || "No paper code"}</span>
                  <span>{node.node_key}</span>
                  <span>
                    Page {selectedPageIndex + 1} / {totalPages}
                  </span>
                  <span>{Math.round(zoom * 100)}%</span>
                  <span>{saveBadge}</span>
                  <span>{releaseStatus}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                {signedUrl ? (
                  <Button type="button" variant="secondary" className="h-9 text-xs" onClick={() => window.open(signedUrl, "_blank", "noopener,noreferrer")}>
                    <Download size={14} /> Original
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" className="h-9 px-2" onClick={closeStudio} aria-label="Close annotation studio">
                  <X size={18} />
                </Button>
              </div>
            </header>

            <AnnotationToolbar
              selectedTool={selectedTool}
              onToolChange={setSelectedTool}
              canUndo={Boolean(history.length)}
              canRedo={Boolean(future.length)}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onSave={() => void saveDraft()}
              onGenerate={() => void generateAnnotatedPdf()}
              onRelease={() => setReleaseDialogOpen(true)}
              saveDisabled={saveStatus === "saving"}
            />

            <div className="grid min-h-0 grid-cols-[250px_minmax(0,1fr)_360px] overflow-hidden">
              <PageThumbnailSidebar
                questionKey={node.node_key}
                questionTitle={node.title}
                totalPages={totalPages}
                currentPageIndex={selectedPageIndex}
                annotations={studioAnnotations}
                uploadStatus={slot?.status ?? annotationKind}
                onPageChange={setSelectedPageIndex}
              />

              <main className="min-w-0 overflow-auto bg-slate-200 p-6">
                <div className="flex min-h-full justify-center">
                  {slot?.object_path ? (
                    signError ? (
                      <div className="flex h-[700px] w-[520px] items-center justify-center rounded-lg border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
                        {signError}
                      </div>
                    ) : signedUrl ? (
                      <PdfAnnotationPage
                        pdfUrl={signedUrl}
                        pageIndex={selectedPageIndex}
                        zoom={zoom}
                        selectedTool={selectedTool}
                        annotations={studioAnnotations}
                        selectedAnnotationId={selectedAnnotationId}
                        onCreateAnnotation={handleCreateAnnotation}
                        onUpdateAnnotation={handleUpdateAnnotation}
                        onDeleteAnnotation={handleDeleteAnnotation}
                        onSelectAnnotation={setSelectedAnnotationId}
                        onPageInfo={handlePageInfo}
                        onInteractionChange={setIsInteracting}
                      />
                    ) : (
                      <div className="flex h-[700px] w-[520px] items-center justify-center rounded-lg border border-slate-200 bg-white text-sm text-slate-500">
                        Loading secure PDF page...
                      </div>
                    )
                  ) : (
                    <TypedResponseAnnotationSurface
                      responseText={response?.answer_text ?? "No typed response recorded for this part."}
                      selectedTool={selectedTool}
                      annotations={studioAnnotations}
                      selectedAnnotationId={selectedAnnotationId}
                      onCreateAnnotation={handleCreateAnnotation}
                      onDeleteAnnotation={handleDeleteAnnotation}
                      onSelectAnnotation={setSelectedAnnotationId}
                    />
                  )}
                </div>
              </main>

              <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Button type="button" variant="secondary" className="h-8 px-3 text-xs" onClick={() => setZoom((value) => Math.max(0.6, value - 0.1))}>
                    -
                  </Button>
                  <Button type="button" variant="secondary" className="h-8 px-3 text-xs" onClick={() => setZoom((value) => Math.min(2.2, value + 0.1))}>
                    +
                  </Button>
                  <span className="text-xs font-bold text-slate-500">Zoom {Math.round(zoom * 100)}%</span>
                </div>
                <AnnotationPropertiesPanel
                  annotation={selectedAnnotation}
                  markSummary={markSummary}
                  privateNotes={privateNotes}
                  studentFeedback={studentFeedback}
                  onChange={(annotation) => handleUpdateAnnotation(annotation)}
                  onPrivateNotesChange={setPrivateNotes}
                  onStudentFeedbackChange={setStudentFeedback}
                />
                <div className="mt-5">
                  <AnnotationListPanel
                    annotations={currentPageAnnotations}
                    selectedAnnotationId={selectedAnnotationId}
                    onSelect={setSelectedAnnotationId}
                    onDelete={handleDeleteAnnotation}
                  />
                </div>
              </aside>
            </div>
          </div>
          <ReleaseAnnotatedPdfDialog
            open={releaseDialogOpen}
            isSaving={isReleasing}
            onCancel={() => setReleaseDialogOpen(false)}
            onConfirm={() => void releaseToStudent()}
          />
        </div>
      ) : null}
    </>
  );
}

function TypedResponseAnnotationSurface({
  responseText,
  selectedTool,
  annotations,
  selectedAnnotationId,
  onCreateAnnotation,
  onDeleteAnnotation,
  onSelectAnnotation,
}: {
  responseText: string;
  selectedTool: AnnotationTool;
  annotations: PdfAnnotation[];
  selectedAnnotationId: string | null;
  onCreateAnnotation: (annotation: PdfAnnotation) => void;
  onDeleteAnnotation: (annotationId: string) => void;
  onSelectAnnotation: (annotationId: string | null) => void;
}) {
  return (
    <div className={cn("relative max-w-[780px] bg-white p-10 shadow-xl", "min-h-[840px] w-[720px]")}>
      <pre className="pointer-events-none whitespace-pre-wrap font-serif text-[15px] leading-8 text-slate-900">{responseText}</pre>
      <div className="absolute inset-0">
        <TextAnnotationOverlay
          selectedTool={selectedTool}
          annotations={annotations}
          selectedAnnotationId={selectedAnnotationId}
          onCreateAnnotation={onCreateAnnotation}
          onDeleteAnnotation={onDeleteAnnotation}
          onSelectAnnotation={onSelectAnnotation}
        />
      </div>
    </div>
  );
}

function TextAnnotationOverlay({
  selectedTool,
  annotations,
  selectedAnnotationId,
  onCreateAnnotation,
  onDeleteAnnotation,
  onSelectAnnotation,
}: {
  selectedTool: AnnotationTool;
  annotations: PdfAnnotation[];
  selectedAnnotationId: string | null;
  onCreateAnnotation: (annotation: PdfAnnotation) => void;
  onDeleteAnnotation: (annotationId: string) => void;
  onSelectAnnotation: (annotationId: string | null) => void;
}) {
  const overlayRef = useRef<SVGSVGElement>(null);

  function pointForEvent(event: React.PointerEvent<SVGSVGElement>) {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  }

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    event.preventDefault();
    event.stopPropagation();
    const point = pointForEvent(event);
    if (!point) return;
    overlayRef.current?.setPointerCapture(event.pointerId);
    if (selectedTool === "select") {
      onSelectAnnotation(null);
      return;
    }
    if (selectedTool === "eraser") return;
    const now = new Date().toISOString();
    const annotation: PdfAnnotation = {
      id: `ann_${crypto.randomUUID()}`,
      type: selectedTool === "comment" ? "comment" : selectedTool === "text" ? "text" : "stamp",
      page_index: 0,
      x: point.x,
      y: point.y,
      width: 0.22,
      height: 0.06,
      stamp: selectedTool === "cross" ? "cross" : selectedTool === "question" ? "question" : "tick",
      text: selectedTool === "text" ? "Edit this note" : undefined,
      comment: selectedTool === "comment" ? "Add comment" : undefined,
      style: { stroke: "#cc0000", color: "#cc0000", stroke_width: 2, opacity: 1, font_size: selectedTool === "tick" || selectedTool === "cross" || selectedTool === "question" ? 32 : 12 },
      visibility: "student_visible",
      severity: "note",
      created_at: now,
      updated_at: now,
    };
    onCreateAnnotation(annotation);
    onSelectAnnotation(annotation.id);
  }

  return (
    <svg
      ref={overlayRef}
      className="annotation-overlay h-full w-full"
      viewBox="0 0 720 840"
      style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
      onPointerDown={handlePointerDown}
    >
      <rect width={720} height={840} fill="transparent" />
      {annotations.map((annotation) => {
        const x = (annotation.x ?? 0) * 720;
        const y = (annotation.y ?? 0) * 840;
        const selected = annotation.id === selectedAnnotationId;
        const color = annotation.style.color ?? annotation.style.stroke ?? "#cc0000";
        if (annotation.type === "stamp") {
          const symbol = annotation.stamp === "cross" ? "✕" : annotation.stamp === "question" ? "?" : "✓";
          const fontSize = annotation.style.font_size ?? 32;
          return (
            <text
              key={annotation.id}
              x={x}
              y={y}
              fill={color}
              fontSize={fontSize}
              fontWeight={900}
              onPointerDown={(event) => {
                event.stopPropagation();
                if (selectedTool === "eraser") onDeleteAnnotation(annotation.id);
                else onSelectAnnotation(annotation.id);
              }}
            >
              {symbol}
            </text>
          );
        }
        return (
          <g
            key={annotation.id}
            onPointerDown={(event) => {
              event.stopPropagation();
              if (selectedTool === "eraser") onDeleteAnnotation(annotation.id);
              else onSelectAnnotation(annotation.id);
            }}
          >
            <rect x={x} y={y} width={(annotation.width ?? 0.2) * 720} height={(annotation.height ?? 0.06) * 840} fill="#fff" stroke={selected ? "#2563eb" : color} strokeWidth={2} />
            <foreignObject x={x + 6} y={y + 6} width={Math.max(40, (annotation.width ?? 0.2) * 720 - 12)} height={Math.max(20, (annotation.height ?? 0.06) * 840 - 12)}>
              <div className="font-bold leading-tight" style={{ color, fontSize: annotation.style.font_size ?? 12 }}>
                {annotation.text || annotation.comment || "Annotation"}
              </div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}
