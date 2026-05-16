"use client";

import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PdfAnnotation } from "@/lib/annotation-model";
import { cn } from "@/lib/utils";

export function AnnotationListPanel({
  annotations,
  selectedAnnotationId,
  onSelect,
  onDelete,
}: {
  annotations: PdfAnnotation[];
  selectedAnnotationId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Annotation list</h3>
        <Badge tone="neutral">{annotations.length}</Badge>
      </div>
      {annotations.length ? (
        <div className="grid gap-2">
          {annotations.map((annotation) => (
            <button
              key={annotation.id}
              type="button"
              className={cn(
                "rounded-md border p-3 text-left transition",
                annotation.id === selectedAnnotationId ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50 hover:bg-white",
              )}
              onClick={() => onSelect(annotation.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-600">
                    {annotation.type} · page {annotation.page_index + 1}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-700">
                    {annotation.text || annotation.comment || annotation.stamp || annotation.type}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-7 px-2 text-red-600"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(annotation.id);
                  }}
                  aria-label="Delete annotation"
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-slate-200 p-3 text-sm italic text-slate-500">No annotations on this page yet.</p>
      )}
    </section>
  );
}
