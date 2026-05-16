"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { screenToNormalized, type Point, type Size } from "@/lib/annotation-coordinates";
import { createAnnotationId, type AnnotationTool, type PdfAnnotation } from "@/lib/annotation-model";
import { cn } from "@/lib/utils";

export type PdfAnnotationPageInfo = {
  pageIndex: number;
  renderedPageWidth: number;
  renderedPageHeight: number;
  pdfWidth: number;
  pdfHeight: number;
  zoom: number;
  rotation: number;
};

type Interaction =
  | { kind: "draw"; pointerId: number; start: Point; annotation: PdfAnnotation }
  | { kind: "move"; pointerId: number; start: Point; annotation: PdfAnnotation }
  | { kind: "resize"; pointerId: number; start: Point; annotation: PdfAnnotation };

export function PdfAnnotationPage({
  pdfUrl,
  pageIndex,
  zoom,
  selectedTool,
  annotations,
  selectedAnnotationId,
  onCreateAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onSelectAnnotation,
  onPageInfo,
  className,
}: {
  pdfUrl: string;
  pageIndex: number;
  zoom: number;
  selectedTool: AnnotationTool;
  annotations: PdfAnnotation[];
  selectedAnnotationId: string | null;
  onCreateAnnotation: (annotation: PdfAnnotation) => void;
  onUpdateAnnotation: (annotation: PdfAnnotation) => void;
  onDeleteAnnotation: (annotationId: string) => void;
  onSelectAnnotation: (annotationId: string | null) => void;
  onPageInfo: (info: PdfAnnotationPageInfo & { totalPages: number }) => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const [pageInfo, setPageInfo] = useState<PdfAnnotationPageInfo | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [draft, setDraft] = useState<PdfAnnotation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const viewport: Size | null = pageInfo
    ? { width: pageInfo.renderedPageWidth, height: pageInfo.renderedPageHeight }
    : null;

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;

    async function renderPage() {
      setError(null);
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();
        const doc = await pdfjs.getDocument({ url: pdfUrl }).promise;
        if (cancelled) return;
        const page = await doc.getPage(pageIndex + 1);
        if (cancelled) return;
        const viewportBase = page.getViewport({ scale: 1 });
        const renderedViewport = page.getViewport({ scale: zoom });
        const deviceRatio = window.devicePixelRatio || 1;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not create PDF canvas context.");

        canvas.width = Math.floor(renderedViewport.width * deviceRatio);
        canvas.height = Math.floor(renderedViewport.height * deviceRatio);
        canvas.style.width = `${renderedViewport.width}px`;
        canvas.style.height = `${renderedViewport.height}px`;
        context.setTransform(deviceRatio, 0, 0, deviceRatio, 0, 0);
        context.clearRect(0, 0, renderedViewport.width, renderedViewport.height);
        renderTask = page.render({ canvas, canvasContext: context, viewport: renderedViewport });
        await renderTask.promise;
        if (cancelled) return;

        const nextInfo = {
          pageIndex,
          renderedPageWidth: renderedViewport.width,
          renderedPageHeight: renderedViewport.height,
          pdfWidth: viewportBase.width,
          pdfHeight: viewportBase.height,
          zoom,
          rotation: renderedViewport.rotation,
        };
        setPageInfo(nextInfo);
        setTotalPages(doc.numPages);
        onPageInfo({ ...nextInfo, totalPages: doc.numPages });
      } catch (renderError) {
        if (!cancelled) setError(renderError instanceof Error ? renderError.message : "Could not render PDF page.");
      }
    }

    void renderPage();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfUrl, pageIndex, zoom, onPageInfo]);

  const renderedAnnotations = useMemo(
    () => [...annotations.filter((annotation) => annotation.page_index === pageIndex), ...(draft ? [draft] : [])],
    [annotations, draft, pageIndex],
  );

  const pointForEvent = useCallback((event: PointerEvent<SVGSVGElement>): Point | null => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return screenToNormalized({ x: event.clientX - rect.left, y: event.clientY - rect.top }, rect);
  }, []);

  function beginOverlayPointer(event: PointerEvent<SVGSVGElement>) {
    if (!viewport) return;
    event.preventDefault();
    event.stopPropagation();
    overlayRef.current?.focus();
    const point = pointForEvent(event);
    if (!point) return;
    overlayRef.current?.setPointerCapture(event.pointerId);

    if (selectedTool === "select") {
      onSelectAnnotation(null);
      return;
    }

    if (selectedTool === "eraser") return;

    if (selectedTool === "text" || selectedTool === "comment" || selectedTool === "tick" || selectedTool === "cross" || selectedTool === "question") {
      const annotation = createPlacedAnnotation(selectedTool, pageIndex, point);
      onCreateAnnotation(annotation);
      onSelectAnnotation(annotation.id);
      return;
    }

    const annotation = createDrawAnnotation(selectedTool, pageIndex, point);
    interactionRef.current = { kind: "draw", pointerId: event.pointerId, start: point, annotation };
    setDraft(annotation);
  }

  function moveOverlayPointer(event: PointerEvent<SVGSVGElement>) {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointForEvent(event);
    if (!point) return;

    if (interaction.kind === "draw") {
      const updated = updateDrawAnnotation(interaction.annotation, interaction.start, point);
      interactionRef.current = { ...interaction, annotation: updated };
      setDraft(updated);
      return;
    }

    if (interaction.kind === "move") {
      const updated = moveAnnotation(interaction.annotation, interaction.start, point);
      interactionRef.current = { ...interaction, annotation: updated, start: point };
      onUpdateAnnotation(updated);
      return;
    }

    const updated = resizeAnnotation(interaction.annotation, point);
    interactionRef.current = { ...interaction, annotation: updated };
    onUpdateAnnotation(updated);
  }

  function endOverlayPointer(event: PointerEvent<SVGSVGElement>) {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    overlayRef.current?.releasePointerCapture(event.pointerId);
    interactionRef.current = null;

    if (interaction.kind === "draw") {
      setDraft(null);
      onCreateAnnotation(interaction.annotation);
      onSelectAnnotation(interaction.annotation.id);
    }
  }

  function beginAnnotationPointer(event: PointerEvent<SVGGElement>, annotation: PdfAnnotation, kind: "move" | "resize") {
    event.preventDefault();
    event.stopPropagation();
    if (selectedTool === "eraser") {
      onDeleteAnnotation(annotation.id);
      return;
    }
    onSelectAnnotation(annotation.id);
    const point = pointForEvent(event as unknown as PointerEvent<SVGSVGElement>);
    if (!point) return;
    overlayRef.current?.setPointerCapture(event.pointerId);
    interactionRef.current = { kind, pointerId: event.pointerId, start: point, annotation };
  }

  function handleKeyDown(event: React.KeyboardEvent<SVGSVGElement>) {
    if (event.key === "Escape") {
      onSelectAnnotation(null);
      return;
    }
    if ((event.key === "Backspace" || event.key === "Delete") && selectedAnnotationId) {
      event.preventDefault();
      onDeleteAnnotation(selectedAnnotationId);
    }
  }

  return (
    <div
      className={cn("annotation-page-shell relative inline-block bg-white shadow-xl", className)}
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
    >
      {error ? (
        <div className="flex h-[720px] w-[520px] items-center justify-center border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
          {error}
        </div>
      ) : null}
      <canvas
        ref={canvasRef}
        className="pdf-canvas block bg-white"
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
        style={{ pointerEvents: "none", userSelect: "none", WebkitUserSelect: "none" }}
        aria-label={`Rendered PDF page ${pageIndex + 1} of ${totalPages}`}
      />
      {pageInfo ? (
        <svg
          ref={overlayRef}
          className="annotation-overlay absolute left-0 top-0"
          width={pageInfo.renderedPageWidth}
          height={pageInfo.renderedPageHeight}
          viewBox={`0 0 ${pageInfo.renderedPageWidth} ${pageInfo.renderedPageHeight}`}
          tabIndex={0}
          role="application"
          aria-label="PDF annotation layer"
          style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none", pointerEvents: "auto" }}
          onPointerDown={beginOverlayPointer}
          onPointerMove={moveOverlayPointer}
          onPointerUp={endOverlayPointer}
          onPointerCancel={endOverlayPointer}
          onKeyDown={handleKeyDown}
        >
          <rect width={pageInfo.renderedPageWidth} height={pageInfo.renderedPageHeight} fill="transparent" />
          {viewport
            ? renderedAnnotations.map((annotation) => (
                <AnnotationShape
                  key={annotation.id}
                  annotation={annotation}
                  viewport={viewport}
                  selected={annotation.id === selectedAnnotationId}
                  onPointerDown={(event, kind) => beginAnnotationPointer(event, annotation, kind)}
                />
              ))
            : null}
        </svg>
      ) : null}
    </div>
  );
}

function AnnotationShape({
  annotation,
  viewport,
  selected,
  onPointerDown,
}: {
  annotation: PdfAnnotation;
  viewport: Size;
  selected: boolean;
  onPointerDown: (event: PointerEvent<SVGGElement>, kind: "move" | "resize") => void;
}) {
  const stroke = annotation.style.stroke ?? annotation.style.color ?? "#cc0000";
  const fill = annotation.style.fill ?? "transparent";
  const opacity = annotation.style.opacity ?? 1;
  const strokeWidth = annotation.style.stroke_width ?? 2;
  const x = (annotation.x ?? 0) * viewport.width;
  const y = (annotation.y ?? 0) * viewport.height;
  const width = (annotation.width ?? 0.08) * viewport.width;
  const height = (annotation.height ?? 0.04) * viewport.height;

  if ((annotation.type === "ink" || annotation.type === "highlight") && annotation.points?.length) {
    const points = annotation.points.map((point) => `${point.x * viewport.width},${point.y * viewport.height}`).join(" ");
    return (
      <g onPointerDown={(event) => onPointerDown(event, "move")} className="cursor-move">
        <polyline
          points={points}
          fill="none"
          stroke={annotation.type === "highlight" ? "#facc15" : stroke}
          strokeWidth={annotation.type === "highlight" ? 14 : strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          opacity={annotation.type === "highlight" ? 0.45 : opacity}
        />
      </g>
    );
  }

  if (annotation.type === "stamp") {
    const size = (annotation.size ?? 0.045) * Math.min(viewport.width, viewport.height);
    const symbol = annotation.stamp === "cross" ? "✕" : annotation.stamp === "question" ? "?" : "✓";
    const color = annotation.stamp === "cross" ? "#b91c1c" : annotation.stamp === "question" ? "#92400e" : "#047857";
    return (
      <g onPointerDown={(event) => onPointerDown(event, "move")} className="cursor-move">
        <text x={x} y={y} fill={color} fontSize={size} fontWeight={900} dominantBaseline="middle" textAnchor="middle">
          {symbol}
        </text>
        {selected ? <SelectionBox x={x - size / 2} y={y - size / 2} width={size} height={size} /> : null}
      </g>
    );
  }

  if (annotation.type === "circle") {
    return (
      <g onPointerDown={(event) => onPointerDown(event, "move")} className="cursor-move">
        <ellipse cx={x + width / 2} cy={y + height / 2} rx={Math.max(width / 2, 2)} ry={Math.max(height / 2, 2)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} vectorEffect="non-scaling-stroke" />
        {selected ? <SelectionBox x={x} y={y} width={width} height={height} onResizePointerDown={onPointerDown} /> : null}
      </g>
    );
  }

  if (annotation.type === "arrow") {
    return (
      <g onPointerDown={(event) => onPointerDown(event, "move")} className="cursor-move">
        <defs>
          <marker id={`arrow-${annotation.id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L8,4 L0,8 z" fill={stroke} />
          </marker>
        </defs>
        <line x1={x} y1={y} x2={x + width} y2={y + height} stroke={stroke} strokeWidth={strokeWidth} markerEnd={`url(#arrow-${annotation.id})`} vectorEffect="non-scaling-stroke" />
        {selected ? <SelectionBox x={Math.min(x, x + width)} y={Math.min(y, y + height)} width={Math.abs(width)} height={Math.abs(height)} onResizePointerDown={onPointerDown} /> : null}
      </g>
    );
  }

  if (annotation.type === "text" || annotation.type === "comment") {
    return (
      <g onPointerDown={(event) => onPointerDown(event, "move")} className="cursor-move">
        <rect x={x} y={y} width={Math.max(width, 42)} height={Math.max(height, 28)} rx={4} fill={annotation.type === "comment" ? "#fef3c7" : "#ffffff"} stroke={stroke} strokeWidth={1.5} opacity={0.94} />
        <foreignObject x={x + 6} y={y + 5} width={Math.max(width - 12, 30)} height={Math.max(height - 10, 18)}>
          <div className="break-words text-[12px] font-bold leading-tight" style={{ color: annotation.style.color ?? stroke }}>
            {annotation.type === "comment" ? "Comment: " : ""}
            {annotation.text || annotation.comment || "Edit text"}
          </div>
        </foreignObject>
        {selected ? <SelectionBox x={x} y={y} width={Math.max(width, 42)} height={Math.max(height, 28)} onResizePointerDown={onPointerDown} /> : null}
      </g>
    );
  }

  return (
    <g onPointerDown={(event) => onPointerDown(event, "move")} className="cursor-move">
      <rect x={x} y={y} width={Math.max(width, 8)} height={Math.max(height, 8)} rx={2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} vectorEffect="non-scaling-stroke" />
      {selected ? <SelectionBox x={x} y={y} width={Math.max(width, 8)} height={Math.max(height, 8)} onResizePointerDown={onPointerDown} /> : null}
    </g>
  );
}

function SelectionBox({
  x,
  y,
  width,
  height,
  onResizePointerDown,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  onResizePointerDown?: (event: PointerEvent<SVGGElement>, kind: "resize") => void;
}) {
  return (
    <g>
      <rect x={x - 3} y={y - 3} width={width + 6} height={height + 6} fill="none" stroke="#2563eb" strokeDasharray="5 4" strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      {onResizePointerDown ? (
        <rect
          x={x + width - 5}
          y={y + height - 5}
          width={10}
          height={10}
          rx={2}
          fill="#2563eb"
          className="cursor-nwse-resize"
          onPointerDown={(event) => onResizePointerDown(event as unknown as PointerEvent<SVGGElement>, "resize")}
        />
      ) : null}
    </g>
  );
}

function createPlacedAnnotation(tool: AnnotationTool, pageIndex: number, point: Point): PdfAnnotation {
  const now = new Date().toISOString();
  if (tool === "text") {
    return baseAnnotation("text", pageIndex, now, { x: point.x, y: point.y, width: 0.22, height: 0.055, text: "Edit this note" });
  }
  if (tool === "comment") {
    return baseAnnotation("comment", pageIndex, now, { x: point.x, y: point.y, width: 0.24, height: 0.07, comment: "Add comment" });
  }
  return baseAnnotation("stamp", pageIndex, now, {
    x: point.x,
    y: point.y,
    size: 0.04,
    stamp: tool === "cross" ? "cross" : tool === "question" ? "question" : "tick",
  });
}

function createDrawAnnotation(tool: AnnotationTool, pageIndex: number, point: Point): PdfAnnotation {
  const now = new Date().toISOString();
  if (tool === "pen" || tool === "highlighter") {
    return baseAnnotation(tool === "highlighter" ? "highlight" : "ink", pageIndex, now, {
      points: [point],
      style: {
        stroke: tool === "highlighter" ? "#facc15" : "#cc0000",
        stroke_width: tool === "highlighter" ? 12 : 2,
        opacity: tool === "highlighter" ? 0.45 : 1,
      },
    });
  }
  return baseAnnotation(tool === "circle" ? "circle" : tool === "arrow" ? "arrow" : "rectangle", pageIndex, now, {
    x: point.x,
    y: point.y,
    width: 0,
    height: 0,
  });
}

function baseAnnotation(type: PdfAnnotation["type"], pageIndex: number, now: string, data: Partial<PdfAnnotation>): PdfAnnotation {
  return {
    id: createAnnotationId(),
    type,
    page_index: pageIndex,
    style: { stroke: "#cc0000", color: "#cc0000", stroke_width: 2, opacity: 1, fill: "transparent", ...data.style },
    visibility: "student_visible",
    severity: "note",
    created_at: now,
    updated_at: now,
    ...data,
  };
}

function updateDrawAnnotation(annotation: PdfAnnotation, start: Point, point: Point): PdfAnnotation {
  const now = new Date().toISOString();
  if (annotation.type === "ink" || annotation.type === "highlight") {
    return { ...annotation, points: [...(annotation.points ?? []), point], updated_at: now };
  }
  return normalizeRectAnnotation({ ...annotation, x: start.x, y: start.y, width: point.x - start.x, height: point.y - start.y, updated_at: now });
}

function moveAnnotation(annotation: PdfAnnotation, start: Point, point: Point): PdfAnnotation {
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  const now = new Date().toISOString();
  if (annotation.points?.length) {
    return {
      ...annotation,
      points: annotation.points.map((item) => ({ x: clampUnit(item.x + dx), y: clampUnit(item.y + dy) })),
      updated_at: now,
    };
  }
  return {
    ...annotation,
    x: clampUnit((annotation.x ?? 0) + dx),
    y: clampUnit((annotation.y ?? 0) + dy),
    updated_at: now,
  };
}

function resizeAnnotation(annotation: PdfAnnotation, point: Point): PdfAnnotation {
  return normalizeRectAnnotation({
    ...annotation,
    width: point.x - (annotation.x ?? 0),
    height: point.y - (annotation.y ?? 0),
    updated_at: new Date().toISOString(),
  });
}

function normalizeRectAnnotation(annotation: PdfAnnotation): PdfAnnotation {
  const x = annotation.x ?? 0;
  const y = annotation.y ?? 0;
  const width = annotation.width ?? 0;
  const height = annotation.height ?? 0;
  return {
    ...annotation,
    x: clampUnit(width < 0 ? x + width : x),
    y: clampUnit(height < 0 ? y + height : y),
    width: Math.min(1, Math.max(0.012, Math.abs(width))),
    height: Math.min(1, Math.max(0.012, Math.abs(height))),
  };
}

function clampUnit(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
