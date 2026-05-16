"use client";

import { Input, Textarea } from "@/components/ui/form";
import type { PdfAnnotation } from "@/lib/annotation-model";

const colors = ["#cc0000", "#2563eb", "#047857", "#92400e", "#111827", "#facc15"];

export function AnnotationPropertiesPanel({
  annotation,
  markSummary,
  privateNotes,
  studentFeedback,
  onChange,
  onPrivateNotesChange,
  onStudentFeedbackChange,
}: {
  annotation: PdfAnnotation | null;
  markSummary: string;
  privateNotes: string;
  studentFeedback: string;
  onChange: (annotation: PdfAnnotation) => void;
  onPrivateNotesChange: (value: string) => void;
  onStudentFeedbackChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Annotation properties</h3>
        {annotation ? (
          <div className="mt-4 grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <select
                className="min-h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm"
                value={annotation.visibility}
                onChange={(event) => onChange({ ...annotation, visibility: event.target.value as PdfAnnotation["visibility"] })}
              >
                <option value="student_visible">Student visible</option>
                <option value="private">Private</option>
              </select>
              <select
                className="min-h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm"
                value={annotation.severity}
                onChange={(event) => onChange({ ...annotation, severity: event.target.value as PdfAnnotation["severity"] })}
              >
                <option value="note">Note</option>
                <option value="minor">Minor</option>
                <option value="major">Major</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            {annotation.type === "text" || annotation.type === "comment" ? (
              <Textarea
                value={annotation.type === "comment" ? annotation.comment ?? "" : annotation.text ?? ""}
                onChange={(event) =>
                  onChange(annotation.type === "comment" ? { ...annotation, comment: event.target.value } : { ...annotation, text: event.target.value })
                }
                placeholder="Annotation text"
              />
            ) : null}
            <Input
              type="number"
              min={1}
              max={24}
              value={annotation.style.stroke_width ?? 2}
              onChange={(event) => onChange({ ...annotation, style: { ...annotation.style, stroke_width: Number(event.target.value) || 2 } })}
              aria-label="Stroke width"
            />
            <div className="flex flex-wrap gap-2">
              {colors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="h-8 w-8 rounded-full border-2 border-white shadow ring-1 ring-slate-200"
                  style={{ backgroundColor: color }}
                  onClick={() => onChange({ ...annotation, style: { ...annotation.style, stroke: color, color } })}
                  aria-label={`Use ${color}`}
                />
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-slate-500">Select an annotation to edit its color, text, visibility, or severity.</p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Mark input</h3>
        <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">{markSummary}</p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Private marker notes</h3>
        <Textarea className="mt-3" value={privateNotes} onChange={(event) => onPrivateNotesChange(event.target.value)} placeholder="Private notes stay hidden from the student." />
      </section>

      <section className="rounded-lg border border-blue-100 bg-blue-50/30 p-4">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-blue-600">Student-facing feedback</h3>
        <Textarea className="mt-3 bg-white" value={studentFeedback} onChange={(event) => onStudentFeedbackChange(event.target.value)} placeholder="Visible after feedback release." />
      </section>
    </div>
  );
}
