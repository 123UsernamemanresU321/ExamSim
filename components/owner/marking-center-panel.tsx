"use client";

import { ChevronDown, ChevronUp, FileText, Info, Award, HelpCircle } from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MathRenderer } from "@/components/math-renderer";

export function MarkingCenterPanel({
  node,
  markschemeHtml,
  markschemePdfPath,
}: {
  node?: any;
  markschemeHtml: string | null;
  markschemePdfPath: string | null;
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

  return (
    <div className="flex flex-col gap-10">
      {/* Question Header */}
      <div className="flex items-start justify-between border-b border-[var(--border)] pb-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-bold text-white">
              {node.node_key}
            </span>
            <h2 className="text-2xl font-extrabold tracking-tight text-[var(--ink)]">
              {node.title || "Question Content"}
            </h2>
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--subtle)]">
            {node.node_type} • Response Mode: <span className="text-[var(--ink)]">{node.response_mode?.replace('_', ' ')}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone="accent" className="px-3 py-1 text-sm font-black italic tracking-tighter">
            {node.marks ?? 0} MARKS
          </Badge>
        </div>
      </div>

      {/* Question Content */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">
          <Info size={12} /> Question Prompt
        </div>
        <Card className="overflow-hidden border-none bg-[var(--surface-muted)] shadow-none">
          <div className="p-8">
            <div className="prose prose-slate max-w-none prose-p:leading-relaxed prose-strong:text-[var(--ink)]">
              {node.prompt_html ? (
                <MathRenderer html={node.prompt_html} className="text-[17px]" />
              ) : node.prompt_latex ? (
                <div className="mt-6 rounded-xl bg-white p-8 shadow-sm border border-[var(--border)]">
                  <MathRenderer latex={`$$${node.prompt_latex}$$`} className="text-xl" />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-[var(--muted)] italic">
                  <p>No prompt content provided for this node.</p>
                </div>
              )}
            </div>
          </div>
        </Card>
      </section>

      {/* Markscheme Panel */}
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
              {node?.markscheme_html ? (
                <div className="prose prose-sm max-w-none">
                  <div className="mb-2 text-[9px] font-black uppercase tracking-widest text-blue-400">Specific Question Guidance</div>
                  <MathRenderer html={node.markscheme_html} />
                </div>
              ) : markschemeHtml ? (
                <div className="prose prose-sm max-w-none">
                  <div className="mb-2 text-[9px] font-black uppercase tracking-widest text-blue-400">Global Assessment Markscheme</div>
                  <MathRenderer html={markschemeHtml} />
                </div>
              ) : markschemePdfPath ? (
                <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-blue-200 rounded-xl bg-white/50">
                  <FileText size={48} className="text-blue-200 mb-4" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-blue-900 uppercase tracking-wide">Document Reference</p>
                    <p className="text-xs text-blue-600">Full PDF markscheme is attached to this version.</p>
                  </div>
                  <Button variant="secondary" className="mt-6 bg-white shadow-sm border-blue-100 text-blue-700 hover:bg-blue-50">
                    <FileText size={14} className="mr-2" /> Open Reference PDF
                  </Button>
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

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}
