"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PdfAnnotation } from "@/lib/annotation-model";
import { cn } from "@/lib/utils";

export function PageThumbnailSidebar({
  questionKey,
  questionTitle,
  totalPages,
  currentPageIndex,
  annotations,
  uploadStatus,
  onPageChange,
}: {
  questionKey: string;
  questionTitle?: string | null;
  totalPages: number;
  currentPageIndex: number;
  annotations: PdfAnnotation[];
  uploadStatus: string;
  onPageChange: (pageIndex: number) => void;
}) {
  return (
    <aside className="grid min-h-0 grid-rows-[auto_1fr] border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Question tree</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-950">{questionKey}</h2>
        {questionTitle ? <p className="mt-1 text-xs leading-5 text-slate-500">{questionTitle}</p> : null}
        <div className="mt-3">
          <Badge tone={uploadStatus === "uploaded" ? "success" : "neutral"}>{uploadStatus.replaceAll("_", " ")}</Badge>
        </div>
      </div>

      <div className="overflow-y-auto p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Pages</p>
        <div className="grid gap-2">
          {Array.from({ length: Math.max(1, totalPages) }).map((_, index) => {
            const count = annotations.filter((annotation) => annotation.page_index === index).length;
            return (
              <Button
                key={index}
                type="button"
                variant={index === currentPageIndex ? "primary" : "secondary"}
                className={cn("h-16 justify-between text-left", index === currentPageIndex && "!text-white")}
                onClick={() => onPageChange(index)}
              >
                <span>Page {index + 1}</span>
                {count ? <Badge tone={index === currentPageIndex ? "neutral" : "accent"}>{count}</Badge> : null}
              </Button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
