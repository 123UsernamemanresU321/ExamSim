"use client";

import { useRef, useState } from "react";
import { ExternalLink, FileUp, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";

const MAX_SCAN_BYTES = 50 * 1024 * 1024;

export function PaperScanUploadPanel({ jobId }: { jobId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "uploading" | "confirming" | "complete" | "error">("idle");
  const [message, setMessage] = useState("Select a PDF scan up to 50 MB.");

  async function upload() {
    const file = inputRef.current?.files?.[0];
    if (!file) return setMessage("Choose a PDF scan first.");
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return setMessage("Paper Mode accepts PDF scans only.");
    if (!file.size || file.size > MAX_SCAN_BYTES) return setMessage("The PDF must be non-empty and no larger than 50 MB.");
    try {
      setState("uploading");
      setMessage("Requesting a private upload slot and uploading the scan...");
      const supabase = createSupabaseBrowserClient();
      const issued = await invokeEdgeFunction<{ object_path: string; upload_token: string }>(supabase, "owner-issue-paper-scan-upload", { body: { paper_mode_job_id: jobId }, requiresAal2: true });
      if (!issued?.object_path || !issued.upload_token) throw new Error("The private upload slot was not returned.");
      const { error: uploadError } = await supabase.storage.from("paper-scans").uploadToSignedUrl(issued.object_path, issued.upload_token, file, { contentType: "application/pdf" });
      if (uploadError) throw uploadError;
      setState("confirming");
      setMessage("Upload complete. Verifying PDF bytes and creating page records...");
      await invokeEdgeFunction(supabase, "owner-confirm-paper-scan-upload", { body: { paper_mode_job_id: jobId, object_path: issued.object_path, file_name: file.name }, requiresAal2: true });
      setState("complete");
      setMessage("Scan verified. Map each page below before marking.");
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The scan could not be uploaded. Retry with the same PDF.");
    }
  }

  return (
    <div className="grid gap-3">
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" disabled={state === "uploading" || state === "confirming"} className="block w-full text-sm text-[var(--muted)] file:mr-3 file:rounded-[2px] file:border file:border-[var(--border)] file:bg-white file:px-3 file:py-2 file:text-xs file:font-semibold" />
      <p className={`text-xs ${state === "error" ? "text-[var(--danger)]" : state === "complete" ? "text-[var(--success)]" : "text-[var(--muted)]"}`}>{message}</p>
      <Button type="button" onClick={upload} isLoading={state === "uploading" || state === "confirming"}>
        {state === "error" ? <RefreshCw size={15} /> : <FileUp size={15} />} {state === "error" ? "Retry upload" : "Upload scan PDF"}
      </Button>
    </div>
  );
}

export function PaperScanOpenButton({ objectPath, pageNumber }: { objectPath: string; pageNumber?: number | null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function openScan() {
    try {
      setLoading(true);
      setError(null);
      const supabase = createSupabaseBrowserClient();
      const result = await invokeEdgeFunction<{ signed_url: string }>(supabase, "owner-sign-storage-url", { body: { bucket: "paper-scans", object_path: objectPath, purpose: "paper_scan", expires_in_seconds: 300 }, requiresAal2: true });
      if (!result?.signed_url) throw new Error("The private scan link was not returned.");
      const suffix = pageNumber ? `#page=${pageNumber}` : "";
      window.open(`${result.signed_url}${suffix}`, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the private scan.");
    } finally {
      setLoading(false);
    }
  }
  return <span className="inline-grid gap-1"><Button type="button" variant="secondary" onClick={openScan} isLoading={loading}><ExternalLink size={14} /> Open scan{pageNumber ? ` page ${pageNumber}` : ""}</Button>{error ? <span className="max-w-56 text-xs text-[var(--danger)]">{error}</span> : null}</span>;
}
