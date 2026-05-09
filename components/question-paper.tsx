"use client";
import { useState, useRef, useEffect } from "react";
import { Flag, UploadCloud } from "lucide-react";
import { MathRenderer } from "@/components/math-renderer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResponseTextArea } from "@/components/response-text-area";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import { validatePdfUpload } from "@/lib/upload-policy";
import type { QuestionNode } from "@/lib/assessment-package";
import { cn } from "@/lib/utils";

function AssetImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      try {
        const { data } = await supabase.storage.from("assessment-packages").createSignedUrl(path, 3600);
        if (!cancelled && data?.signedUrl) setUrl(data.signedUrl);
      } catch {
        /* ignore – image is optional */
      }
    }
    resolve();
    return () => { cancelled = true; };
  }, [path, supabase]);

  if (!url) return null;
  return (
    <img
      src={url}
      alt="Question diagram"
      className="max-h-80 max-w-full rounded-lg border border-[var(--border)] bg-white object-contain shadow-sm"
      loading="lazy"
    />
  );
}

function QuestionBlock({ 
  node, 
  readonly = false, 
  attemptId,
  ownerProfileId,
  stateToken,
  responses = [],
  annotations = []
}: { 
  node: QuestionNode; 
  readonly?: boolean;
  attemptId?: string;
  ownerProfileId?: string;
  stateToken?: string;
  responses?: { question_node_id: string; answer_text: string }[];
  annotations?: { question_node_id: string | null; annotation_type: string; body: string }[];
}) {
  const initialValue = responses.find(r => r.question_node_id === node.node_id)?.answer_text ?? "";
  const [isFlagged, setIsFlagged] = useState(annotations.some(a => a.question_node_id === node.node_id && a.body === "flagged"));
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createSupabaseBrowserClient();

  async function toggleFlag() {
    if (!attemptId || readonly) return;
    try {
      await supabase.from("submission_annotations").insert({
        attempt_id: attemptId,
        question_node_id: node.node_id,
        owner_profile_id: ownerProfileId!,
        annotation_type: "student_flag",
        body: isFlagged ? "unflagged" : "flagged",
        anchor_json: {},
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

  return (
    <article id={node.node_id} className="scroll-mt-24 border-t border-[#dde3ee] py-6 first:border-t-0 first:pt-0">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="paper-body text-xl font-semibold text-[var(--ink)]">
            {node.node_key}. {node.title}
          </h2>
          {typeof node.marks === "number" ? (
            <p className="mt-1 text-sm text-[var(--muted)]">{node.marks} marks</p>
          ) : null}
        </div>
        <Badge tone={node.response_mode.includes("upload") ? "warning" : "neutral"}>
          {node.response_mode.replaceAll("_", " ")}
        </Badge>
      </div>
      <div className="paper-body prose question-prompt max-w-none text-lg leading-relaxed">
        <MathRenderer html={node.prompt?.html} latex={node.prompt?.html ? undefined : node.prompt?.latex} />
      </div>
      {node.assets && node.assets.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-4">
          {node.assets.map((assetPath, idx) => (
            <AssetImage key={`${node.node_id}-asset-${idx}`} path={assetPath} />
          ))}
        </div>
      )}
      {(node.response_mode === "typed_text" || node.response_mode === "typed_or_upload") && attemptId ? (
        <div className="mt-5 grid gap-2 text-sm font-semibold text-[var(--ink)]">
          Typed response
          <ResponseTextArea 
            attemptId={attemptId} 
            questionNodeId={node.node_id} 
            initialValue={initialValue}
            readonly={readonly}
          />
        </div>
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

      {node.children?.map((child) => (
        <QuestionBlock 
          key={child.node_id} 
          node={child} 
          readonly={readonly} 
          attemptId={attemptId}
          ownerProfileId={ownerProfileId}
          stateToken={stateToken}
          responses={responses}
          annotations={annotations}
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
  responses = [],
  annotations = []
}: { 
  questions: QuestionNode[]; 
  readonly?: boolean;
  attemptId?: string;
  ownerProfileId?: string;
  stateToken?: string;
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
            responses={responses}
            annotations={annotations}
          />
        ))}
      </div>
    </main>
  );
}
