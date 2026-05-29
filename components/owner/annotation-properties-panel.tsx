"use client";

import { Input, Textarea } from "@/components/ui/form";
import type { PdfAnnotation } from "@/lib/annotation-model";
import { cn } from "@/lib/utils";

const colors = ["#cc0000", "#2563eb", "#047857", "#92400e", "#111827", "#facc15"];
const fontSizedTypes = new Set<PdfAnnotation["type"]>(["text", "comment", "stamp"]);

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
  const activeColor = annotation?.style.color ?? annotation?.style.stroke ?? "#cc0000";

  return (
    <div className="grid gap-3">
      {/* SECTION 1: Properties */}
      <section className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-500">Annotation properties</h3>
        {annotation ? (
          <div className="mt-3.5 grid gap-3">
            
            {/* Visibility & Severity Row */}
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-0.5">
                <span className="text-[8px] font-black uppercase tracking-wide text-slate-400">Visibility</span>
                <select
                  className="h-8 rounded bg-white border border-slate-200 px-2 text-xs font-semibold focus:outline-none"
                  value={annotation.visibility}
                  onChange={(event) => onChange({ ...annotation, visibility: event.target.value as PdfAnnotation["visibility"] })}
                >
                  <option value="student_visible">🔒 Student Visible</option>
                  <option value="private">👁️ Internal Only</option>
                </select>
              </div>

              <div className="grid gap-0.5">
                <span className="text-[8px] font-black uppercase tracking-wide text-slate-400">Severity</span>
                <select
                  className="h-8 rounded bg-white border border-slate-200 px-2 text-xs font-semibold focus:outline-none"
                  value={annotation.severity}
                  onChange={(event) => onChange({ ...annotation, severity: event.target.value as PdfAnnotation["severity"] })}
                >
                  <option value="note">Note</option>
                  <option value="minor">Minor error</option>
                  <option value="major">Major error</option>
                  <option value="critical">Critical error</option>
                </select>
              </div>
            </div>

            {/* Comment/Text input */}
            {annotation.type === "text" || annotation.type === "comment" ? (
              <div className="grid gap-1">
                <span className="text-[8px] font-black uppercase tracking-wide text-slate-400">Text Content</span>
                <Textarea
                  value={annotation.type === "comment" ? annotation.comment ?? "" : annotation.text ?? ""}
                  onChange={(event) =>
                    onChange(annotation.type === "comment" ? { ...annotation, comment: event.target.value } : { ...annotation, text: event.target.value })
                  }
                  placeholder="Annotation content text..."
                  rows={2}
                  className="text-xs p-2 min-h-12 border-slate-200 focus:ring-1"
                />
              </div>
            ) : null}

            {/* Stroke Width & Font Size Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-0.5">
                <span className="text-[8px] font-black uppercase tracking-wide text-slate-400">Stroke weight</span>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={annotation.style.stroke_width ?? 2}
                  onChange={(event) => onChange({ ...annotation, style: { ...annotation.style, stroke_width: Number(event.target.value) || 2 } })}
                  className="h-8 text-xs px-2 border-slate-200"
                />
              </div>

              {fontSizedTypes.has(annotation.type) ? (
                <div className="grid gap-0.5">
                  <span className="text-[8px] font-black uppercase tracking-wide text-slate-400">Font size</span>
                  <Input
                    type="number"
                    min={8}
                    max={72}
                    value={annotation.style.font_size ?? (annotation.type === "stamp" ? 28 : 12)}
                    onChange={(event) =>
                      onChange({
                        ...annotation,
                        style: {
                          ...annotation.style,
                          font_size: Math.max(8, Math.min(72, Number(event.target.value) || (annotation.type === "stamp" ? 28 : 12))),
                        },
                      })
                    }
                    className="h-8 text-xs px-2 border-slate-200"
                  />
                </div>
              ) : null}
            </div>

            {/* Color Swatches */}
            <div className="grid gap-1">
              <span className="text-[8px] font-black uppercase tracking-wide text-slate-400">Palette color</span>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {colors.map((color) => {
                  const isActive = activeColor.toLowerCase() === color.toLowerCase();
                  return (
                    <button
                      key={color}
                      type="button"
                      className={cn(
                        "h-6 w-6 rounded-full border border-white shadow-sm ring-1 ring-slate-200 transition-transform active:scale-95 cursor-pointer",
                        isActive && "ring-2 ring-indigo-500 scale-110"
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() => onChange({ ...annotation, style: { ...annotation.style, stroke: color, color } })}
                      aria-label={`Use ${color}`}
                    />
                  );
                })}
              </div>
            </div>

          </div>
        ) : (
          <p className="mt-2.5 text-[11px] leading-relaxed text-slate-500 italic">Select canvas annotation overlay to adjust color details, text blocks, and severity.</p>
        )}
      </section>

      {/* SECTION 2: Mark Summary */}
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-500">Node Mark Summary</h3>
        <p className="mt-2 rounded bg-slate-50 border border-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-800">{markSummary}</p>
      </section>

      {/* SECTION 3: Private Notes */}
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-500">Marker Private Ledger</h3>
        <Textarea 
          className="mt-2 text-xs p-2 min-h-16 border-slate-200 focus:ring-1" 
          value={privateNotes} 
          onChange={(event) => onPrivateNotesChange(event.target.value)} 
          placeholder="Private annotation logs remain securely hidden from student accounts." 
          rows={2}
        />
      </section>

      {/* SECTION 4: Student Feedback */}
      <section className="rounded-xl border border-blue-100 bg-blue-50/20 p-3 shadow-sm">
        <h3 className="text-[9px] font-black uppercase tracking-widest text-blue-600">Student Feedback summary</h3>
        <Textarea 
          className="mt-2 text-xs p-2 min-h-20 bg-white border-blue-100 focus:border-blue-400 focus:ring-blue-400/20" 
          value={studentFeedback} 
          onChange={(event) => onStudentFeedbackChange(event.target.value)} 
          placeholder="Detailed narrative feedback summary. Transmitted automatically upon feedback release." 
          rows={3}
        />
      </section>
    </div>
  );
}
