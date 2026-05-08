"use client";

import { ChevronDown, ChevronUp, FileText, Info } from "lucide-react";
import { useState } from "react";
import type { QuestionNode } from "@/lib/assessment-package";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function MarkingCenterPanel({
  node,
  markschemeHtml,
  markschemePdfPath,
}: {
  node?: any; // Using any because we pass QuestionNodeRow which matches the fields
  markschemeHtml: string | null;
  markschemePdfPath: string | null;
}) {
  const [showMarkscheme, setShowMarkscheme] = useState(true);

  if (!node) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--muted)]">
        <div className="text-center">
          <Info size={48} className="mx-auto mb-4 opacity-20" />
          <p>Select a question from the tree to begin marking.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Question Header */}
      <div>
        <h2 className="text-2xl font-bold text-[var(--ink)]">
          {node.node_key}. {node.title || "Question"}
        </h2>
        <div className="mt-2 flex items-center gap-4 text-sm text-[var(--muted)]">
          <span className="font-medium px-2 py-0.5 rounded bg-[var(--surface-muted)] text-[var(--ink)]">
            {node.marks ?? 0} MARKS
          </span>
          <span className="uppercase tracking-wider">{node.node_type}</span>
        </div>
      </div>

      {/* Question Content */}
      <Card className="p-6 border-none bg-[var(--surface-muted)] shadow-none">
        <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-strong:text-[var(--ink)]">
          {node.prompt_html && (
            <div dangerouslySetInnerHTML={{ __html: node.prompt_html }} />
          )}
          {node.prompt_latex && (
            <div className="mt-4 p-4 rounded bg-white font-serif italic text-lg text-center border border-[var(--border)]">
              $${node.prompt_latex}$$
            </div>
          )}
          {!node.prompt_html && !node.prompt_latex && (
            <p className="italic opacity-50">No prompt content available for this node.</p>
          )}
        </div>
      </Card>

      {/* Markscheme Panel */}
      <section className="border-t border-[var(--border)] pt-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-blue-500" />
            <h3 className="text-lg font-bold">Markscheme</h3>
          </div>
          <Button
            variant="ghost"
            onClick={() => setShowMarkscheme(!showMarkscheme)}
            className="h-8 gap-2"
          >
            {showMarkscheme ? (
              <>Hide <ChevronUp size={14} /></>
            ) : (
              <>Show <ChevronDown size={14} /></>
            )}
          </Button>
        </div>

        {showMarkscheme && (
          <div className="rounded-lg border border-[var(--border)] p-6 bg-blue-50/30">
            {markschemeHtml ? (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: markschemeHtml }}
              />
            ) : markschemePdfPath ? (
              <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-blue-200 rounded-lg">
                <FileText size={32} className="text-blue-300 mb-2" />
                <p className="text-sm text-blue-600 font-medium">Markscheme PDF available</p>
                <Button variant="secondary" className="mt-4 h-8 text-xs">View full markscheme PDF</Button>
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)] italic">No markscheme has been uploaded for this assessment version.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
