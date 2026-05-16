"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { Circle, ExternalLink, Maximize2, MousePointer2, Pencil, Square, StickyNote, Trash2, Type, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/form";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import { cn } from "@/lib/utils";
import type { QuestionNodeRow, TextResponse, UploadSlot, WorkAnnotation } from "@/types/database";

type AnnotationTool = "note" | "text_box" | "rectangle" | "circle" | "sketch";

type OverlayAnchor = {
  studio_version?: number;
  annotation_tool?: AnnotationTool;
  page?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
  text?: string | null;
  points?: { x: number; y: number }[];
  selected_text?: string | null;
};

type DraftOverlay = Required<Pick<OverlayAnchor, "annotation_tool" | "page" | "x" | "y" | "color">> &
  Partial<Pick<OverlayAnchor, "width" | "height" | "points" | "text" | "selected_text">>;

const tools: { value: AnnotationTool; label: string; icon: typeof StickyNote }[] = [
  { value: "note", label: "Note", icon: StickyNote },
  { value: "text_box", label: "Text", icon: Type },
  { value: "rectangle", label: "Box", icon: Square },
  { value: "circle", label: "Circle", icon: Circle },
  { value: "sketch", label: "Sketch", icon: Pencil },
];

const colors = ["#b91c1c", "#1d4ed8", "#047857", "#92400e", "#111827"];

export function WorkAnnotationStudio({
  attemptId,
  node,
  response,
  slot,
  annotations,
}: {
  attemptId: string;
  node: QuestionNodeRow;
  response?: TextResponse;
  slot?: UploadSlot;
  annotations: WorkAnnotation[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const [tool, setTool] = useState<AnnotationTool>("rectangle");
  const [color, setColor] = useState(colors[0]);
  const [page, setPage] = useState("1");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"student_visible" | "private">("student_visible");
  const [severity, setSeverity] = useState<"note" | "minor" | "major" | "critical">("note");
  const [selectedText, setSelectedText] = useState("");
  const [draft, setDraft] = useState<DraftOverlay | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const annotationKind = slot?.object_path ? "uploaded_pdf" : response?.answer_text ? "typed_text" : "general";
  const pageNumber = Math.max(1, Number(page) || 1);
  const currentPageAnnotations = useMemo(
    () => annotations.filter((annotation) => readOverlayAnchor(annotation.anchor_json).page === pageNumber),
    [annotations, pageNumber],
  );

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

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function captureSelectedText() {
    const selection = window.getSelection()?.toString().trim();
    if (selection) setSelectedText(selection.slice(0, 700));
  }

  function pointForEvent(event: PointerEvent<HTMLDivElement>) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100),
    };
  }

  function startDraw(event: PointerEvent<HTMLDivElement>) {
    if (annotationKind === "typed_text" || tool === "note") return;
    const point = pointForEvent(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDrawing(true);
    setDraft({
      annotation_tool: tool,
      page: pageNumber,
      x: point.x,
      y: point.y,
      width: tool === "text_box" ? 24 : 0,
      height: tool === "text_box" ? 8 : 0,
      points: tool === "sketch" ? [point] : undefined,
      color,
    });
  }

  function updateDraw(event: PointerEvent<HTMLDivElement>) {
    if (!isDrawing) return;
    const point = pointForEvent(event);
    if (!point) return;
    setDraft((current) => {
      if (!current) return current;
      if (current.annotation_tool === "sketch") {
        return { ...current, points: [...(current.points ?? []), point] };
      }
      return {
        ...current,
        width: point.x - current.x,
        height: point.y - current.y,
      };
    });
  }

  function stopDraw() {
    if (!isDrawing) return;
    setIsDrawing(false);
    setDraft((current) => normalizeDraft(current));
  }

  function placeTextBox() {
    setDraft({
      annotation_tool: "text_box",
      page: pageNumber,
      x: 12,
      y: 12,
      width: 38,
      height: 10,
      color,
    });
  }

  async function saveAnnotation() {
    const trimmedBody = body.trim();
    if (!trimmedBody) return;
    const overlay = draft ?? {
      annotation_tool: annotationKind === "typed_text" ? "note" : tool,
      page: pageNumber,
      x: 6,
      y: 6,
      color,
      selected_text: selectedText || null,
    };
    setIsSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await invokeEdgeFunction(supabase, "save-work-annotation", {
        body: {
          attempt_id: attemptId,
          question_node_id: node.id,
          upload_slot_id: slot?.id ?? null,
          text_response_id: response?.id ?? null,
          annotation_kind: annotationKind,
          visibility,
          severity,
          body: trimmedBody,
          anchor_json: {
            studio_version: 1,
            ...overlay,
            text: overlay.annotation_tool === "text_box" ? trimmedBody : overlay.text ?? null,
            selected_text: selectedText || overlay.selected_text || null,
          },
        },
        requiresAal2: true,
      });
      setBody("");
      setSelectedText("");
      setDraft(null);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not save annotation.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteAnnotation(annotationId: string) {
    if (!confirm("Delete this marker annotation?")) return;
    const supabase = createSupabaseBrowserClient();
    await invokeEdgeFunction(supabase, "save-work-annotation", {
      body: { attempt_id: attemptId, question_node_id: node.id, annotation_id: annotationId, annotation_kind: annotationKind, delete: true },
      requiresAal2: true,
    });
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="secondary" className="text-xs" onClick={() => setOpen(true)}>
        <Maximize2 size={14} /> Open annotation studio
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 bg-slate-950/80 p-3 text-[var(--ink)] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Annotation studio for ${node.node_key}`}>
          <div className="grid h-full overflow-hidden rounded-xl border border-slate-700 bg-slate-100 shadow-2xl lg:grid-cols-[280px_1fr_360px]">
            <aside className="overflow-y-auto border-r border-slate-200 bg-white p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Annotation Studio</p>
                  <h2 className="mt-1 text-lg font-black">{node.node_key}</h2>
                </div>
                <Button type="button" variant="ghost" className="h-9 px-2" onClick={() => setOpen(false)} aria-label="Close annotation studio">
                  <X size={18} />
                </Button>
              </div>

              <div className="grid gap-4">
                <div>
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">Tool</label>
                  <div className="grid grid-cols-2 gap-2">
                    {tools.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Button
                          key={item.value}
                          type="button"
                          variant={tool === item.value ? "primary" : "secondary"}
                          className={cn("justify-start text-xs", tool === item.value && "text-white")}
                          onClick={() => {
                            setTool(item.value);
                            if (item.value === "text_box") placeTextBox();
                            if (item.value === "note") setDraft(null);
                          }}
                        >
                          <Icon size={14} /> {item.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Page / View</label>
                  <Input type="number" min={1} value={page} onChange={(event) => setPage(event.target.value)} />
                </div>

                <div>
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">Color</label>
                  <div className="flex flex-wrap gap-2">
                    {colors.map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={cn("h-8 w-8 rounded-full border-2 border-white shadow ring-1 ring-slate-200", color === item && "ring-2 ring-offset-2 ring-slate-900")}
                        style={{ backgroundColor: item }}
                        onClick={() => setColor(item)}
                        aria-label={`Use color ${item}`}
                      />
                    ))}
                  </div>
                </div>

                {annotationKind === "typed_text" ? (
                  <div className="grid gap-2">
                    <Button type="button" variant="secondary" className="justify-self-start text-xs" onClick={captureSelectedText}>
                      <MousePointer2 size={14} /> Use selected text
                    </Button>
                    <Input value={selectedText} onChange={(event) => setSelectedText(event.target.value)} placeholder="Quoted student text or line reference" />
                  </div>
                ) : null}

                <div className="grid gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Annotation text</label>
                  <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="What should the student or marker see here?" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <select className="min-h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm" value={visibility} onChange={(event) => setVisibility(event.target.value as "student_visible" | "private")}>
                    <option value="student_visible">Student visible</option>
                    <option value="private">Private</option>
                  </select>
                  <select className="min-h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm" value={severity} onChange={(event) => setSeverity(event.target.value as "note" | "minor" | "major" | "critical")}>
                    <option value="note">Note</option>
                    <option value="minor">Minor</option>
                    <option value="major">Major</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => void saveAnnotation()} disabled={isSaving || !body.trim()} className="text-white">
                    Save annotation
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setDraft(null)}>
                    Clear draft
                  </Button>
                </div>
              </div>
            </aside>

            <main className="grid min-h-0 gap-3 overflow-hidden bg-slate-200 p-4">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                    {slot?.object_path ? "Uploaded PDF annotation layer" : "Typed response annotation layer"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Draw over the current page/view. Open the original PDF in a new tab when you need native PDF zoom or page search.
                  </p>
                </div>
                {signedUrl ? (
                  <Button type="button" variant="secondary" onClick={() => window.open(signedUrl, "_blank", "noopener,noreferrer")}>
                    <ExternalLink size={14} /> Original
                  </Button>
                ) : null}
              </div>

              <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(320px,1fr)_minmax(360px,560px)]">
                <div className="min-h-0 overflow-hidden rounded-lg border border-slate-300 bg-white">
                  {slot?.object_path ? (
                    signError ? (
                      <div className="p-4 text-sm text-red-700">{signError}</div>
                    ) : signedUrl ? (
                      <iframe title="Student uploaded PDF source" src={signedUrl} className="h-full min-h-[620px] w-full bg-white" />
                    ) : (
                      <div className="flex h-full min-h-[620px] items-center justify-center text-sm text-slate-500">Loading signed PDF preview...</div>
                    )
                  ) : response?.answer_text ? (
                    <div className="h-full min-h-[620px] overflow-y-auto whitespace-pre-wrap p-6 text-sm leading-7 text-slate-900">{response.answer_text}</div>
                  ) : (
                    <div className="flex h-full min-h-[620px] items-center justify-center text-sm text-slate-500">No submitted work available for this part.</div>
                  )}
                </div>

                <div
                  ref={canvasRef}
                  className="relative min-h-[620px] overflow-hidden rounded-lg border border-slate-400 bg-white shadow-inner"
                  onPointerDown={startDraw}
                  onPointerMove={updateDraw}
                  onPointerUp={stopDraw}
                  onPointerCancel={stopDraw}
                >
                  <div className="absolute left-4 top-4 rounded-md border border-slate-200 bg-white/90 px-3 py-2 text-xs font-bold text-slate-600 shadow-sm">
                    Page/view {pageNumber} annotation layer
                  </div>
                  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Annotation overlay">
                    {currentPageAnnotations.map((annotation) => (
                      <OverlayShape key={annotation.id} anchor={readOverlayAnchor(annotation.anchor_json)} label={annotation.body} />
                    ))}
                    {draft ? <OverlayShape anchor={draft} label={body || "Draft annotation"} isDraft /> : null}
                  </svg>
                </div>
              </div>
            </main>

            <aside className="overflow-y-auto border-l border-slate-200 bg-white p-4">
              <div className="mb-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Saved annotations</p>
                <h3 className="mt-1 text-base font-black">{annotations.length} total</h3>
              </div>
              {annotations.length ? (
                <div className="grid gap-3">
                  {annotations.map((annotation) => {
                    const anchor = readOverlayAnchor(annotation.anchor_json);
                    return (
                      <div key={annotation.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="flex flex-wrap gap-2">
                            <Badge tone={annotation.visibility === "student_visible" ? "accent" : "neutral"}>{annotation.visibility.replace("_", " ")}</Badge>
                            <Badge tone={annotation.severity === "major" || annotation.severity === "critical" ? "warning" : "neutral"}>{annotation.severity}</Badge>
                          </div>
                          <Button variant="ghost" className="h-7 px-2 text-red-600" onClick={() => void deleteAnnotation(annotation.id)} aria-label="Delete annotation">
                            <Trash2 size={13} />
                          </Button>
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                          {(anchor.annotation_tool ?? "note").replace("_", " ")} · page/view {anchor.page ?? "?"}
                        </p>
                        {anchor.selected_text ? <blockquote className="my-2 border-l-2 border-blue-300 pl-3 text-xs italic text-slate-600">{anchor.selected_text}</blockquote> : null}
                        <p className="mt-2 text-sm leading-6 text-slate-900">{annotation.body}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-slate-200 p-4 text-sm italic text-slate-500">No annotations saved yet.</p>
              )}
            </aside>
          </div>
        </div>
      ) : null}
    </>
  );
}

function OverlayShape({ anchor, label, isDraft = false }: { anchor: OverlayAnchor; label: string; isDraft?: boolean }) {
  const color = anchor.color ?? "#b91c1c";
  const tool = anchor.annotation_tool ?? "note";
  const x = anchor.x ?? 6;
  const y = anchor.y ?? 6;
  const width = anchor.width ?? 20;
  const height = anchor.height ?? 8;
  const normalized = normalizeRect({ x, y, width, height });

  if (tool === "sketch" && anchor.points?.length) {
    const points = anchor.points.map((point) => `${point.x},${point.y}`).join(" ");
    return <polyline points={points} fill="none" stroke={color} strokeWidth={isDraft ? 0.8 : 0.6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={isDraft ? 0.7 : 1} />;
  }

  if (tool === "circle") {
    return (
      <g opacity={isDraft ? 0.7 : 1}>
        <ellipse cx={normalized.x + normalized.width / 2} cy={normalized.y + normalized.height / 2} rx={Math.max(normalized.width / 2, 1)} ry={Math.max(normalized.height / 2, 1)} fill="none" stroke={color} strokeWidth={0.45} vectorEffect="non-scaling-stroke" />
        <OverlayLabel x={normalized.x} y={normalized.y} color={color} label={label} />
      </g>
    );
  }

  if (tool === "rectangle" || tool === "text_box") {
    return (
      <g opacity={isDraft ? 0.7 : 1}>
        <rect x={normalized.x} y={normalized.y} width={Math.max(normalized.width, 1)} height={Math.max(normalized.height, 1)} rx={tool === "text_box" ? 0.8 : 0.2} fill={tool === "text_box" ? `${color}18` : "none"} stroke={color} strokeWidth={0.45} vectorEffect="non-scaling-stroke" />
        <OverlayLabel x={normalized.x} y={normalized.y} color={color} label={label} />
      </g>
    );
  }

  return <OverlayLabel x={x} y={y} color={color} label={label} />;
}

function OverlayLabel({ x, y, color, label }: { x: number; y: number; color: string; label: string }) {
  const display = label.length > 42 ? `${label.slice(0, 42)}...` : label;
  return (
    <foreignObject x={clamp(x)} y={Math.max(0, clamp(y) - 4)} width={32} height={8}>
      <div className="rounded-sm px-1 py-0.5 text-[3px] font-bold text-white" style={{ backgroundColor: color }}>
        {display}
      </div>
    </foreignObject>
  );
}

function readOverlayAnchor(anchor: unknown): OverlayAnchor {
  if (!anchor || typeof anchor !== "object" || Array.isArray(anchor)) return {};
  return anchor as OverlayAnchor;
}

function normalizeDraft(draft: DraftOverlay | null): DraftOverlay | null {
  if (!draft) return null;
  if (draft.annotation_tool === "sketch") return draft.points?.length ? draft : null;
  const normalized = normalizeRect({
    x: draft.x,
    y: draft.y,
    width: draft.width ?? 18,
    height: draft.height ?? 8,
  });
  return { ...draft, ...normalized };
}

function normalizeRect(rect: { x: number; y: number; width: number; height: number }) {
  const x = rect.width < 0 ? rect.x + rect.width : rect.x;
  const y = rect.height < 0 ? rect.y + rect.height : rect.y;
  return {
    x: clamp(x),
    y: clamp(y),
    width: Math.max(1, Math.min(100 - clamp(x), Math.abs(rect.width))),
    height: Math.max(1, Math.min(100 - clamp(y), Math.abs(rect.height))),
  };
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}
