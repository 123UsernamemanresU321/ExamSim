"use client";
/* eslint-disable @next/next/no-img-element */
import { useState, useRef } from "react";
import { Flag, UploadCloud } from "lucide-react";
import { MathRenderer } from "@/components/math-renderer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResponseTextArea } from "@/components/response-text-area";
import { ChoiceResponseControl, NumericalResponseControl } from "@/components/structured-response-control";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import { validatePdfUpload } from "@/lib/upload-policy";
import type { QuestionNode } from "@/lib/assessment-package";
import { cn } from "@/lib/utils";

function AssetImage({ path, signedUrl }: { path: string; signedUrl?: string }) {
  const url = signedUrl ?? null;

  if (!url) return <div className="text-xs text-red-500 italic">Diagram unavailable: {path.split("/").pop()}</div>;

  return (
    <div className="my-4">
      <img
        src={url}
        alt="Question diagram"
        className="max-h-[500px] max-w-full rounded-lg border border-[var(--border)] bg-white object-contain shadow-md"
        loading="lazy"
      />
    </div>
  );
}

function QuestionBlock({ 
  node, 
  readonly = false, 
  attemptId,
  ownerProfileId,
  stateToken,
  assetUrls = {},
  responses = [],
  annotations = [],
  depth = 0
}: { 
  node: QuestionNode; 
  readonly?: boolean;
  attemptId?: string;
  ownerProfileId?: string;
  stateToken?: string;
  assetUrls?: Record<string, string>;
  responses?: { question_node_id: string; answer_text: string }[];
  annotations?: { question_node_id: string | null; annotation_type: string; body: string }[];
  depth?: number;
}) {
  const initialValue = responses.find(r => r.question_node_id === node.node_id)?.answer_text ?? "";
  const [isFlagged, setIsFlagged] = useState(annotations.some(a => a.question_node_id === node.node_id && a.body === "flagged"));
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createSupabaseBrowserClient();

  async function toggleFlag() {
    if (!attemptId || !stateToken || readonly) return;
    try {
      await invokeEdgeFunction(supabase, "set-question-flag", {
        body: {
          attempt_id: attemptId,
          question_node_id: node.node_id,
          flagged: !isFlagged,
          state_token: stateToken,
        },
      });
      setIsFlagged(!isFlagged);
    } catch (e) {
      console.error("Flagging failed", e);
    }
  }

  async function handleUpload(file: File) {
    if (!attemptId || !stateToken || readonly) return;
    const validation = validatePdfUpload(file);
    if (!validation.ok) {
      alert(validation.error);
      return;
    }

    setIsUploading(true);
    try {
      const slot = await invokeEdgeFunction<{ bucket: string; path: string; upload_token: string; question_node_id: string }>(supabase, "issue-upload-slot-url", {
        body: { attempt_id: attemptId, question_node_id: node.node_id, state_token: stateToken },
      });
      
      if (!slot) throw new Error("Could not issue upload URL");

      const { error: uploadError } = await supabase.storage
        .from(slot.bucket)
        .uploadToSignedUrl(slot.path, slot.upload_token, file, {
          contentType: file.type || "application/pdf",
        });
      if (uploadError) throw uploadError;

      await invokeEdgeFunction(supabase, "confirm-upload-slot", {
        body: {
          attempt_id: attemptId,
          question_node_id: slot.question_node_id,
          object_path: slot.path,
          state_token: stateToken,
          file_size_bytes: file.size,
          content_type: file.type || "application/pdf",
        },
      });
      alert("PDF uploaded successfully!");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  const hasInputs = node.response_mode !== "none";

  return (
    <article 
      id={node.node_id} 
      className={cn(
        "scroll-mt-24 border-t border-[#dde3ee] py-6 first:border-t-0 first:pt-0",
        depth > 0 && "ml-4 md:ml-8 border-t-0 pt-2"
      )}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={cn(
            "paper-body font-semibold text-[var(--ink)]",
            depth === 0 ? "text-xl" : "text-lg"
          )}>
            {node.node_key}. {node.title}
          </h2>
          {typeof node.marks === "number" ? (
            <p className="mt-1 text-sm text-[var(--muted)]">[{node.marks} marks]</p>
          ) : null}
        </div>
        {hasInputs && (
          <Badge tone={node.response_mode.includes("upload") ? "warning" : "neutral"}>
            {node.response_mode.replaceAll("_", " ")}
          </Badge>
        )}
      </div>

      <div className="paper-body prose question-prompt max-w-none text-lg leading-relaxed">
        <MathRenderer html={node.prompt?.html} latex={node.prompt?.html ? undefined : node.prompt?.latex} />
      </div>

      {node.assets && node.assets.length > 0 && (
        <div className="mt-4 flex flex-col gap-4">
          {node.assets.map((assetPath, idx) => (
            <AssetImage key={`${node.node_id}-asset-${idx}`} path={assetPath} signedUrl={assetUrls[assetPath]} />
          ))}
        </div>
      )}

      {hasInputs && (
        <>
          {(node.response_mode === "typed_text" || node.response_mode === "typed_or_upload") && attemptId && stateToken ? (
            <div className="mt-5 grid gap-2 text-sm font-semibold text-[var(--ink)]">
              Typed response
              <ResponseTextArea 
                attemptId={attemptId} 
                questionNodeId={node.node_id} 
                stateToken={stateToken}
                initialValue={initialValue}
                readonly={readonly}
              />
            </div>
          ) : null}
          {node.response_mode === "multiple_choice" && attemptId && stateToken ? (
            <ChoiceResponseControl
              attemptId={attemptId}
              questionNode={node}
              stateToken={stateToken}
              initialValue={initialValue}
              readonly={readonly}
            />
          ) : null}
          {node.response_mode === "numerical" && attemptId && stateToken ? (
            <NumericalResponseControl
              attemptId={attemptId}
              questionNode={node}
              stateToken={stateToken}
              initialValue={initialValue}
              readonly={readonly}
            />
          ) : null}
          {node.response_mode === "upload_pdf" || node.response_mode === "typed_or_upload" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                }}
              />
              <Button type="button" variant="secondary" disabled={readonly || isUploading} onClick={() => fileInputRef.current?.click()}>
                <UploadCloud size={16} aria-hidden="true" />
                {isUploading ? "Uploading..." : "Request upload slot"}
              </Button>
            </div>
          ) : null}
          <div className="mt-4">
            <Button type="button" variant={isFlagged ? "secondary" : "ghost"} disabled={readonly} onClick={toggleFlag} className="text-xs font-bold uppercase tracking-widest h-8 px-3">
              <Flag size={14} aria-hidden="true" className={cn("mr-2", isFlagged && "fill-current text-red-500")} />
              {isFlagged ? "Question Flagged" : "Flag for review"}
            </Button>
          </div>
        </>
      )}

      {node.children?.map((child) => (
        <QuestionBlock 
          key={child.node_id} 
          node={child} 
          readonly={readonly} 
          attemptId={attemptId}
          ownerProfileId={ownerProfileId}
          stateToken={stateToken}
          assetUrls={assetUrls}
          responses={responses}
          annotations={annotations}
          depth={depth + 1}
        />
      ))}
    </article>
  );
}
export function QuestionPaper({ 
  questions, 
  readonly = false,
  attemptId,
  ownerProfileId,
  stateToken,
  assetUrls = {},
  responses = [],
  annotations = []
}: { 
  questions: QuestionNode[]; 
  readonly?: boolean;
  attemptId?: string;
  ownerProfileId?: string;
  stateToken?: string;
  assetUrls?: Record<string, string>;
  responses?: { question_node_id: string; answer_text: string }[];
  annotations?: { question_node_id: string | null; annotation_type: string; body: string }[];
}) {
  return (
    <main className="paper-sheet min-h-[80vh] rounded-lg border border-[var(--border)] px-6 py-8 md:px-12 md:py-12">
      <div className="mx-auto max-w-[920px]">
        {questions.map((node) => (
          <QuestionBlock 
            key={node.node_id} 
            node={node} 
            readonly={readonly} 
            attemptId={attemptId}
            ownerProfileId={ownerProfileId}
            stateToken={stateToken}
            assetUrls={assetUrls}
            responses={responses}
            annotations={annotations}
          />
        ))}
      </div>
    </main>
  );
}
