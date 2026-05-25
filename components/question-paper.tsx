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
import { uploadStudentPdfForQuestion, type StudentUploadCompletion } from "@/lib/student-upload-client";
import type { QuestionNode } from "@/lib/assessment-package";
import { cn } from "@/lib/utils";
import type { UploadSlot } from "@/types/database";

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
  uploadSlots = [],
  onUploadComplete,
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
  uploadSlots?: UploadSlot[];
  onUploadComplete?: (completion: StudentUploadCompletion) => void;
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
          question_node_key: node.node_key,
          flagged: !isFlagged,
          state_token: stateToken,
        },
      });
      setIsFlagged(!isFlagged);
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Flagging failed", e);
      }
    }
  }

  async function handleUpload(file: File) {
    if (!attemptId || !stateToken || readonly) return;

    setIsUploading(true);
    try {
      const completion = await uploadStudentPdfForQuestion({
        supabase,
        attemptId,
        questionNodeId: node.node_id,
        questionKey: node.node_key,
        stateToken,
        file,
      });
      onUploadComplete?.(completion);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  const hasInputs = node.response_mode !== "none";
  const uploadSlot = uploadSlots.find((slot) => slot.question_node_id === node.node_id);
  const showRootUploadControl = depth === 0 && Boolean(uploadSlot) && !readonly;
  const uploadIsLocked = uploadSlot?.status === "uploaded" || uploadSlot?.status === "blank_placeholder" || Boolean(uploadSlot?.locked_at);

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

      {(hasInputs || showRootUploadControl) && (
        <>
          {(node.response_mode === "typed_text" || node.response_mode === "typed_or_upload") && attemptId && stateToken ? (
            <div className="mt-5 grid gap-2 text-sm font-semibold text-[var(--ink)]">
              Typed response
              <ResponseTextArea 
                attemptId={attemptId} 
                questionNodeId={node.node_id} 
                questionNodeKey={node.node_key}
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
          {showRootUploadControl ? (
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
              <Button type="button" variant="secondary" disabled={readonly || isUploading || uploadIsLocked} onClick={() => fileInputRef.current?.click()}>
                <UploadCloud size={16} aria-hidden="true" />
                {isUploading ? "Uploading..." : uploadSlot?.status === "blank_placeholder" ? "Blank submitted" : uploadIsLocked ? "Uploaded - locked" : `Upload PDF for ${node.node_key}`}
              </Button>
              <p className="basis-full text-xs font-semibold leading-5 text-[var(--muted)]">
                One PDF for all parts of {node.node_key}. Include every subpart in this single file and label subquestions clearly.
              </p>
              {uploadSlot?.status === "uploaded" ? (
                <p className="basis-full rounded-md border border-[#78a86d] bg-[var(--success-bg)] px-3 py-2 text-xs font-semibold text-[#123d18]" role="status">
                  Uploaded: {uploadSlot.original_file_name ?? uploadSlot.object_path?.split("/").pop() ?? "PDF confirmed"}
                </p>
              ) : null}
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
          uploadSlots={uploadSlots}
          onUploadComplete={onUploadComplete}
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
  annotations = [],
  uploadSlots = [],
  onUploadComplete,
}: { 
  questions: QuestionNode[]; 
  readonly?: boolean;
  attemptId?: string;
  ownerProfileId?: string;
  stateToken?: string;
  assetUrls?: Record<string, string>;
  responses?: { question_node_id: string; answer_text: string }[];
  annotations?: { question_node_id: string | null; annotation_type: string; body: string }[];
  uploadSlots?: UploadSlot[];
  onUploadComplete?: (completion: StudentUploadCompletion) => void;
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
            uploadSlots={uploadSlots}
            onUploadComplete={onUploadComplete}
          />
        ))}
      </div>
    </main>
  );
}
