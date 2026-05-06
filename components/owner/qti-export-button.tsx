"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function QtiExportButton({ versionId }: { versionId: string }) {
  const [message, setMessage] = useState<string | null>(null);

  async function exportQti() {
    setMessage("Preparing QTI export...");
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.functions.invoke<{ download_url?: string | null }>("qti-export-assessment", {
      body: { assessment_version_id: versionId },
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    if (data?.download_url) window.location.href = data.download_url;
    setMessage("QTI ZIP export generated. The signed link expires shortly.");
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
