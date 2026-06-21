"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";

export function MoodleExportButton({ versionId, published }: { versionId: string; published: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function run() {
    try {
      setLoading(true);
      setMessage("Preparing conservative Moodle XML...");
      const supabase = createSupabaseBrowserClient();
      const result = await invokeEdgeFunction<{ download_url?: string | null; fidelity_warnings?: string[] }>(supabase, "moodle-export-assessment", { body: { assessment_version_id: versionId }, requiresAal2: true });
      if (!result?.download_url) throw new Error("The signed Moodle XML link was not returned.");
      window.location.href = result.download_url;
      setMessage(`Export generated with ${result.fidelity_warnings?.length ?? 0} fidelity warning(s). Review every imported Moodle question.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Moodle XML export failed."); }
    finally { setLoading(false); }
  }
  return <div className="grid gap-2"><Button type="button" variant="secondary" disabled={!published} isLoading={loading} onClick={run}><FileDown size={16} /> Export Moodle XML</Button><p className="text-xs leading-5 text-[var(--muted)]" role="status">{message ?? (published ? "Lossy interactions are converted to review-required essay questions." : "Publish the reviewed assessment before exporting.")}</p></div>;
}
