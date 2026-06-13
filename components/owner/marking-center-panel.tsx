"use client";
/* eslint-disable @next/next/no-img-element */

import { ChevronDown, ChevronUp, ExternalLink, FileText, HelpCircle, ImageIcon, Info, Award, AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MathRenderer } from "@/components/math-renderer";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import { cn } from "@/lib/utils";
import { computeMarkingTotals, isMarkableMarkingNode, type MarkingTreeNode } from "@/lib/marking-tree";
import type { Mark } from "@/types/database";

export function MarkingCenterPanel({
  node,
  marks,
  markschemeHtml,
  markschemePdfPath,
  sourceObjectPath,
  sourcePageRanges = [],
  visualWarnings = [],
  assetSigningMode = "owner",
}: {
  node?: MarkingTreeNode | null;
  marks: Mark[];
  markschemeHtml: string | null;
  markschemePdfPath: string | null;
  sourceObjectPath?: string | null;
  sourcePageRanges?: Array<{ node_key: string; start: number | null; end: number | null }>;
  visualWarnings?: string[];
  assetSigningMode?: "owner" | "none";
}) {
  const [showMarkscheme, setShowMarkscheme] = useState(true);

  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-[var(--muted)] opacity-50">
        <HelpCircle size={64} strokeWidth={1} className="mb-4" />
        <p className="text-lg font-medium">Select a question to view details</p>
        <p className="text-sm">Navigation tree is on the left</p>
      </div>
    );
  }

  const totals = computeMarkingTotals(node, marks);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="flex min-h-9 min-w-9 items-center justify-center rounded-full bg-[var(--primary)] px-2 text-xs font-bold !text-white">
              {node.node_key}
            </span>
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">
              {node.title || "Question Content"}
            </h2>
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--subtle)]">
            Full question view • {totals.markableLeafCount} markable part{totals.markableLeafCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge tone="accent" className="px-3 py-1 text-sm font-semibold italic tracking-tighter">
            {totals.awarded} / {totals.max} MARKS
          </Badge>
          {totals.hasExplicitTotalMismatch ? (
            <div className="flex max-w-72 items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] font-semibold leading-snug text-amber-900">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              Child mark total differs from a printed parent total. Marking uses child totals.
            </div>
          ) : null}
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">
          <Info size={12} /> Question Prompt
        </div>
        {visualWarnings.length ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900">
            {visualWarnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}
        <Card className="overflow-hidden border-none bg-[var(--surface-muted)] shadow-none">
          <div className="p-6 md:p-8">
            <div className="space-y-6">
              <QuestionPromptNode node={node} marks={marks} depth={0} assetSigningMode={assetSigningMode} />
              {sourceObjectPath && assetSigningMode === "owner" ? (
                <SourcePdfFallback node={node} sourceObjectPath={sourceObjectPath} sourcePageRanges={sourcePageRanges} />
              ) : null}
            </div>
          </div>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-600">
            <Award size={14} /> Official Markscheme
          </div>
          <Button
            variant="ghost"
            onClick={() => setShowMarkscheme(!showMarkscheme)}
            className="h-8 gap-2 text-xs font-bold uppercase tracking-wider text-blue-600 hover:bg-blue-50 hover:text-blue-700"
          >
            {showMarkscheme ? (
              <>Collapse <ChevronUp size={14} /></>
            ) : (
              <>Expand <ChevronDown size={14} /></>
            )}
          </Button>
        </div>

        {showMarkscheme && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="rounded-xl border border-blue-100 bg-blue-50/30 p-8 shadow-sm">
              {findNodeMarkschemeHtml(node) ? (
                <div className="prose prose-sm max-w-none">
                  <div className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-blue-400">Question Guidance</div>
                  <MathRenderer html={findNodeMarkschemeHtml(node) ?? undefined} />
                </div>
              ) : markschemeHtml ? (
                <div className="prose prose-sm max-w-none">
                  <div className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-blue-400">Global Assessment Markscheme</div>
                  <MathRenderer html={markschemeHtml} />
                </div>
              ) : markschemePdfPath ? (
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-blue-200 bg-white/50 py-12 text-center">
                  <FileText size={48} className="mb-4 text-blue-200" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold uppercase tracking-wide text-blue-900">Document Reference</p>
                    <p className="text-xs text-blue-600">Full PDF markscheme is attached to this version.</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-[var(--muted)] italic">
                  <p className="text-sm">No specific markscheme data found for this version.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function SourcePdfFallback({
  node,
  sourceObjectPath,
  sourcePageRanges,
}: {
  node: MarkingTreeNode;
  sourceObjectPath: string;
  sourcePageRanges: Array<{ node_key: string; start: number | null; end: number | null }>;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [previewRequested, setPreviewRequested] = useState(false);
  const pageLabel = node.source_page_start
    ? node.source_page_end && node.source_page_end !== node.source_page_start
      ? `pages ${node.source_page_start}-${node.source_page_end}`
      : `page ${node.source_page_start}`
    : "source PDF";

  async function signSource() {
    if (signedUrl) return signedUrl;
    setIsSigning(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const data = await invokeEdgeFunction<{ signed_url: string }>(supabase, "owner-sign-storage-url", {
        body: {
          bucket: "assessment-sources",
          object_path: sourceObjectPath,
          purpose: "assessment_source",
          expires_in_seconds: 300,
        },
        requiresAal2: true,
      });
      if (!data?.signed_url) throw new Error("Could not create signed source URL");
      setSignedUrl(data.signed_url);
      return data.signed_url;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not open source PDF";
      setError(message);
      return null;
    } finally {
      setIsSigning(false);
    }
  }

  async function loadPreview() {
    setPreviewRequested(true);
    await signSource();
  }

  async function openSourcePdf() {
    const url = await signSource();
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-700">Original PDF context</p>
          <p className="text-xs leading-5 text-amber-900/80">
            Use this fallback when OCR loses a diagram, graph, table, or image for {node.node_key} ({pageLabel}).
          </p>
          {sourcePageRanges.length ? (
            <p className="mt-1 text-[11px] text-amber-900/70">
              Page map:{" "}
              {sourcePageRanges.slice(0, 6).map((range) => `${range.node_key}:${range.start ?? "?"}-${range.end ?? range.start ?? "?"}`).join(", ")}
              {sourcePageRanges.length > 6 ? "..." : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" className="h-9 text-xs" onClick={loadPreview} disabled={isSigning}>
            <FileText size={14} />
            {previewRequested && isSigning ? "Loading..." : previewRequested ? "Reload preview" : "Load source preview"}
          </Button>
          <Button type="button" variant="secondary" className="h-9 text-xs" onClick={openSourcePdf} disabled={isSigning}>
            <ExternalLink size={14} />
            {isSigning && !previewRequested ? "Preparing..." : "Open source PDF"}
          </Button>
        </div>
      </div>
      {error ? (
        <div className="rounded-lg border border-amber-200 bg-white p-3 text-xs text-amber-900">{error}</div>
      ) : previewRequested && signedUrl ? (
        <iframe
          title={`Original source PDF for ${node.node_key}`}
          src={signedUrl}
          className="h-[620px] w-full rounded-lg border border-amber-100 bg-white"
        />
      ) : previewRequested && isSigning ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-amber-200 bg-white/60 text-sm italic text-amber-700">
          Loading original PDF context...
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-amber-200 bg-white/60 text-sm italic text-amber-700">
          Source PDF preview is not loaded automatically. Use the buttons above if you need the original paper context.
        </div>
      )}
    </div>
  );
}

function QuestionPromptNode({
  node,
  marks,
  depth,
  assetSigningMode,
}: {
  node: MarkingTreeNode;
  marks: Mark[];
  depth: number;
  assetSigningMode: "owner" | "none";
}) {
  const totals = computeMarkingTotals(node, marks);
  const isLeaf = isMarkableMarkingNode(node);
  const hasPrompt = Boolean(node.prompt_html || node.prompt_latex);

  return (
    <article
      id={`mark-node-${node.id}`}
      className={cn(
        "scroll-mt-24 rounded-lg border border-transparent bg-white/60 p-4",
        depth === 0 && "bg-white shadow-sm",
        depth > 0 && "ml-3 border-l-[3px] border-l-slate-200",
      )}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={cn("font-bold text-[var(--ink)]", depth === 0 ? "text-xl" : "text-base")}>
            {node.node_key}
            {node.title ? <span className="font-semibold"> — {node.title}</span> : null}
          </h3>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">
            {node.node_type.replaceAll("_", " ")}
            {isLeaf ? ` • ${node.response_mode.replaceAll("_", " ")}` : " • derived total"}
          </p>
        </div>
        <Badge tone={isLeaf ? "neutral" : "accent"} className="font-semibold tabular-nums">
          {totals.awarded} / {totals.max}
        </Badge>
      </div>

      {hasPrompt ? (
        <div className="prose question-prompt max-w-none text-[16px] leading-relaxed prose-p:leading-relaxed">
          <MathRenderer html={node.prompt_html ?? undefined} latex={node.prompt_html ? undefined : node.prompt_latex ?? undefined} />
        </div>
      ) : (
        <p className="text-sm italic text-[var(--muted)]">No separate prompt text for this part.</p>
      )}

      <QuestionAssets node={node} assetSigningMode={assetSigningMode} />

      {node.children.length > 0 ? (
        <div className="mt-5 space-y-4">
          {node.children.map((child) => (
            <QuestionPromptNode key={child.id} node={child} marks={marks} depth={depth + 1} assetSigningMode={assetSigningMode} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function QuestionAssets({ node, assetSigningMode }: { node: MarkingTreeNode; assetSigningMode: "owner" | "none" }) {
  const assets = (node.assets ?? []).filter(Boolean);
  if (!assets.length) return null;

  return (
    <div className="mt-4 grid gap-4">
      {assets.map((assetPath) => (
        <SignedQuestionAsset key={`${node.id}-${assetPath}`} assetPath={assetPath} assetSigningMode={assetSigningMode} />
      ))}
    </div>
  );
}

function SignedQuestionAsset({ assetPath, assetSigningMode }: { assetPath: string; assetSigningMode: "owner" | "none" }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function signAsset() {
      if (assetSigningMode === "none") {
        setError("Private asset access is not available in this view");
        return;
      }
      try {
        const supabase = createSupabaseBrowserClient();
        const data = await invokeEdgeFunction<{ signed_url: string }>(supabase, "owner-sign-storage-url", {
          body: {
            bucket: "assessment-packages",
            object_path: assetPath,
            purpose: "parse_artifact",
            expires_in_seconds: 300,
          },
          requiresAal2: true,
        });
        if (!data?.signed_url) throw new Error("Could not create signed asset URL");
        if (!cancelled) setSignedUrl(data.signed_url);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not open diagram");
      }
    }
    signAsset();
    return () => {
      cancelled = true;
    };
  }, [assetPath, assetSigningMode]);

  const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(assetPath);

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <ImageIcon size={15} className="mt-0.5 flex-shrink-0" />
        <span>Asset unavailable: {assetPath.split("/").pop()} ({error})</span>
      </div>
    );
  }

  if (!signedUrl) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-xs font-semibold text-[var(--muted)]">
        Loading diagram asset...
      </div>
    );
  }

  if (!isImage) {
    return (
      <a
        href={signedUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-blue-700 hover:bg-blue-50"
      >
        <ExternalLink size={15} />
        Open attached asset
      </a>
    );
  }

  return (
    <figure className="overflow-hidden rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <img src={signedUrl} alt={`Diagram for ${assetPath.split("/").pop() ?? "question"}`} className="max-h-[520px] w-full object-contain" />
      <figcaption className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--subtle)]">
        {assetPath.split("/").pop()}
      </figcaption>
    </figure>
  );
}

function findNodeMarkschemeHtml(node: MarkingTreeNode): string | null {
  if (node.markscheme_html) return node.markscheme_html;
  for (const child of node.children) {
    const match = findNodeMarkschemeHtml(child);
    if (match) return match;
  }
  return null;
}

function Badge({ children, tone, className }: { children: React.ReactNode; tone: "neutral" | "success" | "warning" | "danger" | "accent"; className?: string }) {
  const tones = {
    neutral: "border-[var(--border)] bg-white text-[var(--muted)]",
    success: "border-[#78a86d] bg-[var(--success-bg)] text-[#123d18]",
    warning: "border-[#d7b85f] bg-[var(--warning-bg)] text-[var(--warning)]",
    danger: "border-[#e7a09a] bg-[var(--danger-bg)] text-[var(--danger)]",
    accent: "border-[#9aa7bd] bg-[var(--surface-muted)] text-[var(--primary)]",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}
