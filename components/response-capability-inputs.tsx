"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eraser, PenLine, Table2, Trash2 } from "lucide-react";
import {
  parseStoredResponseValue,
  serializeTableResponse,
  serializeWhiteboardResponse,
  type WhiteboardStroke,
} from "@/lib/response-values";
import type { QuestionNode } from "@/lib/assessment-package";
import { cn } from "@/lib/utils";

type Interaction = NonNullable<QuestionNode["interaction"]>;

export function TableResponseInput({
  interaction,
  initialValue,
  readonly = false,
  onSerializedChange,
}: {
  interaction?: Interaction;
  initialValue: string;
  readonly?: boolean;
  onSerializedChange: (serialized: string) => void;
}) {
  const columns = useMemo(() => normalizeColumns(interaction), [interaction]);
  const rows = useMemo(() => normalizeRows(interaction), [interaction]);
  const initial = parseStoredResponseValue(initialValue);
  const [cells, setCells] = useState<Record<string, string>>(initial.kind === "table" ? initial.cells : {});

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const parsed = parseStoredResponseValue(initialValue);
      if (parsed.kind === "table") setCells(parsed.cells);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialValue]);

  function updateCell(cellKey: string, value: string) {
    if (readonly) return;
    const next = { ...cells, [cellKey]: value };
    setCells(next);
    onSerializedChange(serializeTableResponse({ cells: next }));
  }

  if (!columns.length || !rows.length) {
    return (
      <div className="mt-5 rounded-[4px] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        This table response has no rows or columns configured yet. Ask the teacher to review the question setup.
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-[4px] border border-[var(--border)] bg-white p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
        <Table2 size={16} aria-hidden="true" />
        Table response
      </div>
      <div className="overflow-x-auto rounded-[4px] border border-[var(--border)]">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead className="bg-[var(--surface-muted)] text-left text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            <tr>
              <th className="border-b border-[var(--border)] px-3 py-2">Row</th>
              {columns.map((column) => (
                <th key={column.id} className="border-b border-l border-[var(--border)] px-3 py-2">
                  {column.label}
                  {column.unit ? <span className="ml-1 normal-case text-[var(--subtle)]">({column.unit})</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th className="w-32 border-b border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-left font-semibold text-[var(--ink)]">
                  {row.label}
                </th>
                {columns.map((column) => {
                  const key = `${row.id}:${column.id}`;
                  const lockedValue = row.cells[column.id];
                  const locked = column.locked || typeof lockedValue === "string" || typeof lockedValue === "number";
                  return (
                    <td key={key} className="border-b border-l border-[var(--border)] p-0">
                      {locked ? (
                        <div className="min-h-10 bg-[var(--surface-muted)] px-3 py-2 text-[var(--muted)]">
                          {String(lockedValue ?? "")}
                        </div>
                      ) : (
                        <input
                          value={cells[key] ?? ""}
                          disabled={readonly}
                          onChange={(event) => updateCell(key, event.target.value)}
                          className="h-10 w-full border-0 bg-white px-3 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--primary)]/20 disabled:bg-[var(--surface-muted)]"
                          aria-label={`${row.label}, ${column.label}`}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function WhiteboardResponseInput({
  initialValue,
  readonly = false,
  onSerializedChange,
}: {
  initialValue: string;
  readonly?: boolean;
  onSerializedChange: (serialized: string) => void;
}) {
  const parsed = parseStoredResponseValue(initialValue);
  const [strokes, setStrokes] = useState<WhiteboardStroke[]>(parsed.kind === "whiteboard" ? parsed.strokes : []);
  const [activeStroke, setActiveStroke] = useState<WhiteboardStroke | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = parseStoredResponseValue(initialValue);
      if (next.kind === "whiteboard") setStrokes(next.strokes);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialValue]);

  function pointFromEvent(event: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  }

  function startStroke(event: React.PointerEvent<SVGSVGElement>) {
    if (readonly) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const next: WhiteboardStroke = {
      id: crypto.randomUUID(),
      color: "#111827",
      width: 2,
      points: [pointFromEvent(event)],
    };
    setActiveStroke(next);
  }

  function moveStroke(event: React.PointerEvent<SVGSVGElement>) {
    if (!activeStroke || readonly) return;
    setActiveStroke({
      ...activeStroke,
      points: [...activeStroke.points, pointFromEvent(event)],
    });
  }

  function finishStroke(event: React.PointerEvent<SVGSVGElement>) {
    if (!activeStroke || readonly) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const next = activeStroke.points.length > 1 ? [...strokes, activeStroke] : strokes;
    setStrokes(next);
    setActiveStroke(null);
    onSerializedChange(serializeWhiteboardResponse({ strokes: next }));
  }

  function clearBoard() {
    if (readonly) return;
    setStrokes([]);
    setActiveStroke(null);
    onSerializedChange(serializeWhiteboardResponse({ strokes: [] }));
  }

  return (
    <div className="mt-5 rounded-[4px] border border-[var(--border)] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
          <PenLine size={16} aria-hidden="true" />
          Whiteboard response
        </div>
        <button
          type="button"
          disabled={readonly || strokes.length === 0}
          onClick={clearBoard}
          className="inline-flex h-8 items-center gap-2 rounded-[2px] border border-[var(--border)] px-3 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 size={14} aria-hidden="true" />
          Clear
        </button>
      </div>
      <div className="rounded-[4px] border border-[var(--border)] bg-white">
        <svg
          ref={svgRef}
          role="img"
          aria-label="Whiteboard response canvas"
          viewBox="0 0 1000 600"
          className={cn("block aspect-[5/3] w-full touch-none select-none", readonly ? "cursor-default" : "cursor-crosshair")}
          onPointerDown={startStroke}
          onPointerMove={moveStroke}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
        >
          {[...strokes, ...(activeStroke ? [activeStroke] : [])].map((stroke) => (
            <polyline
              key={stroke.id}
              fill="none"
              stroke={stroke.color}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={stroke.width * 2}
              points={stroke.points.map((point) => `${point.x * 1000},${point.y * 600}`).join(" ")}
            />
          ))}
        </svg>
      </div>
      <p className="mt-2 flex items-center gap-2 text-xs leading-5 text-[var(--muted)]">
        <Eraser size={14} aria-hidden="true" />
        Simple pen input is stored as normalized strokes. Advanced graphing/geometry tools stay disabled unless the teacher enables a real provider.
      </p>
    </div>
  );
}

function normalizeColumns(interaction?: Interaction) {
  const raw = Array.isArray(interaction?.columns) ? interaction.columns : [];
  return raw.flatMap((column, index) => {
    if (!isRecord(column)) return [];
    const id = stringValue(column.id) ?? `c${index + 1}`;
    return [{
      id,
      label: stringValue(column.label) ?? `Column ${index + 1}`,
      locked: column.locked === true,
      answer: column.answer !== false,
      unit: stringValue(column.unit),
    }];
  });
}

function normalizeRows(interaction?: Interaction) {
  const raw = Array.isArray(interaction?.rows) ? interaction.rows : [];
  return raw.flatMap((row, index) => {
    if (!isRecord(row)) return [];
    const id = stringValue(row.id) ?? `r${index + 1}`;
    const cells = isRecord(row.cells) ? row.cells : {};
    return [{
      id,
      label: stringValue(row.label) ?? `Row ${index + 1}`,
      cells,
    }];
  });
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
