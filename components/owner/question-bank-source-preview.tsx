"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { ExternalLink, FileText, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";

type RenderedSourcePage = {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
};

export function QuestionBankSourcePreview({
  objectPath,
  pageStart,
  pageEnd,
}: {
  objectPath: string | null;
  pageStart: number | null;
  pageEnd: number | null;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [renderedPages, setRenderedPages] = useState<RenderedSourcePage[]>([]);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [omittedPageCount, setOmittedPageCount] = useState(0);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!objectPath) return;
    let cancelled = false;
    async function signSource() {
      setError(null);
      try {
        const supabase = createSupabaseBrowserClient();
        const data = await invokeEdgeFunction<{ signed_url: string }>(supabase, "owner-sign-storage-url", {
          body: {
            bucket: "assessment-sources",
            object_path: objectPath,
            purpose: "assessment_source",
            expires_in_seconds: 300,
          },
          requiresAal2: true,
        });
        if (!data?.signed_url) throw new Error("Could not create signed source link.");
        if (!cancelled) setSignedUrl(data.signed_url);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the source PDF.");
      }
    }
    void signSource();
    return () => {
      cancelled = true;
    };
  }, [objectPath]);

  useEffect(() => {
    if (!signedUrl) return;
    const sourceUrl = signedUrl;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;

    async function renderSourcePages() {
      setError(null);
      setIsRendering(true);
      setRenderedPages([]);
      setOmittedPageCount(0);
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();
        const doc = await pdfjs.getDocument({ url: sourceUrl }).promise;
        if (cancelled) return;
        setTotalPages(doc.numPages);

        const start = clampPage(pageStart ?? 1, doc.numPages);
        const end = clampPage(pageEnd ?? start, doc.numPages);
        const cappedEnd = Math.min(end, start + 2);
        const pagesToRender = Array.from({ length: cappedEnd - start + 1 }, (_, index) => start + index);
        const rendered: RenderedSourcePage[] = [];

        for (const pageNumber of pagesToRender) {
          const page = await doc.getPage(pageNumber);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: 1.35 });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Could not create PDF preview canvas.");
          const deviceRatio = window.devicePixelRatio || 1;
          canvas.width = Math.floor(viewport.width * deviceRatio);
          canvas.height = Math.floor(viewport.height * deviceRatio);
          context.setTransform(deviceRatio, 0, 0, deviceRatio, 0, 0);
          renderTask = page.render({ canvas, canvasContext: context, viewport });
          await renderTask.promise;
          if (cancelled) return;
          rendered.push({
            pageNumber,
            dataUrl: canvas.toDataURL("image/png"),
            width: viewport.width,
            height: viewport.height,
          });
        }

        setRenderedPages(rendered);
        setOmittedPageCount(Math.max(0, end - cappedEnd));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not render the source PDF page.");
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    }

    void renderSourcePages();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pageEnd, pageStart, signedUrl]);

  if (!objectPath) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border)] p-5 text-sm text-[var(--muted)]">
        No original source PDF is attached to this question library item.
      </div>
    );
  }

  const pageLabel = pageStart ? `page ${pageStart}${pageEnd && pageEnd !== pageStart ? `-${pageEnd}` : ""}` : "unknown page";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--ink)]">
          <FileText size={16} /> Original source PDF ({pageLabel})
        </div>
        {signedUrl ? (
          <Button type="button" variant="secondary" className="h-9 text-xs" onClick={() => window.open(signedUrl, "_blank", "noopener,noreferrer")}>
            <ExternalLink size={14} /> Open source
          </Button>
        ) : null}
      </div>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : isRendering || (signedUrl && !renderedPages.length) ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-sm text-[var(--muted)]">
          Rendering private source page preview...
        </div>
      ) : renderedPages.length ? (
        <div className="space-y-4">
          {!pageStart ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              Page range is unknown, so the preview starts at page 1. Set source pages during parse review for precise diagram context.
            </div>
          ) : null}
          {renderedPages.map((page) => (
            <figure key={page.pageNumber} className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
              <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-bold text-[var(--muted)]">
                <span className="inline-flex items-center gap-2">
                  <ImageIcon size={14} /> Rendered source page {page.pageNumber}
                </span>
                <span>{Math.round(page.width)} x {Math.round(page.height)}</span>
              </div>
              <div className="overflow-auto bg-neutral-100 p-3">
                <img
                  src={page.dataUrl}
                  alt={`Rendered original source page ${page.pageNumber}`}
                  draggable={false}
                  className="mx-auto block max-w-full select-none rounded bg-white shadow-sm"
                />
              </div>
            </figure>
          ))}
          {omittedPageCount > 0 ? (
            <p className="text-xs font-semibold text-[var(--muted)]">
              {omittedPageCount} additional source page{omittedPageCount === 1 ? "" : "s"} in this range are not rendered here. Open the full source PDF if needed.
            </p>
          ) : null}
          {totalPages ? <p className="text-xs text-[var(--muted)]">Source document has {totalPages} page{totalPages === 1 ? "" : "s"}.</p> : null}
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-sm text-[var(--muted)]">
          Loading private source preview...
        </div>
      )}
    </div>
  );
}

function clampPage(page: number, totalPages: number) {
  return Math.min(Math.max(1, Math.trunc(page)), totalPages);
}
