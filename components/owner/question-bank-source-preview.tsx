"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";

export function QuestionBankSourcePreview({
  objectPath,
  pageStart,
  pageEnd,
}: {
  objectPath: string | null;
  pageStart: number | null;
  pageEnd: number | null;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!objectPath) return;
    let cancelled = false;
    async function signSource() {
      setError(null);
      try {
        const supabase = createSupabaseBrowserClient();
        const data = await invokeEdgeFunction<{ signed_url: string }>(supabase, "owner-sign-storage-url", {
          body: {
            bucket: "assessment-sources",
            object_path: objectPath,
            purpose: "assessment_source",
            expires_in_seconds: 300,
          },
          requiresAal2: true,
        });
        if (!data?.signed_url) throw new Error("Could not create signed source link.");
        if (!cancelled) setSignedUrl(data.signed_url);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the source PDF.");
      }
    }
    void signSource();
    return () => {
      cancelled = true;
    };
  }, [objectPath]);

  if (!objectPath) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border)] p-5 text-sm text-[var(--muted)]">
        No original source PDF is attached to this question bank item.
      </div>
    );
  }

  const pageLabel = pageStart ? `page ${pageStart}${pageEnd && pageEnd !== pageStart ? `-${pageEnd}` : ""}` : "unknown page";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--ink)]">
          <FileText size={16} /> Original source PDF ({pageLabel})
        </div>
        {signedUrl ? (
          <Button type="button" variant="secondary" className="h-9 text-xs" onClick={() => window.open(signedUrl, "_blank", "noopener,noreferrer")}>
            <ExternalLink size={14} /> Open source
          </Button>
        ) : null}
      </div>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : signedUrl ? (
        <iframe title="Question source PDF preview" src={signedUrl} className="h-[720px] w-full rounded-lg border border-[var(--border)] bg-white" />
      ) : (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-sm text-[var(--muted)]">
          Loading private source preview...
        </div>
      )}
    </div>
  );
}
