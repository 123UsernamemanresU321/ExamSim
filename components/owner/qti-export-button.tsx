"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";

export function QtiExportButton({ versionId }: { versionId: string }) {
  const [message, setMessage] = useState<string | null>(null);

  async function exportQti() {
    setMessage("Preparing QTI export...");
    const supabase = createSupabaseBrowserClient();
    try {
      const data = await invokeEdgeFunction<{ download_url?: string | null }>(supabase, "qti-export-assessment", {
        body: { assessment_version_id: versionId },
        requiresAal2: true,
      });
      if (data?.download_url) window.location.href = data.download_url;
      setMessage("QTI ZIP export generated. The signed link expires shortly.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not export QTI ZIP.");
    }
  }

  return (
    <div className="grid gap-2">
      <Button type="button" variant="secondary" onClick={() => void exportQti()}>
        <FileDown size={16} aria-hidden="true" />
        Export QTI ZIP
      </Button>
      {message ? <p className="text-sm text-[var(--muted)]" role="status">{message}</p> : null}
    </div>
  );
}
