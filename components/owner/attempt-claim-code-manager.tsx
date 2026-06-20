"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status-message";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";

type IssuedClaimCode = {
  claim_code: string;
  expires_at: string;
};

export function AttemptClaimCodeManager({ attemptId }: { attemptId: string }) {
  const [issued, setIssued] = useState<IssuedClaimCode | null>(null);
  const [isIssuing, setIsIssuing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function issueCode() {
    setError(null);
    setIssued(null);
    setCopied(false);
    setIsIssuing(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const result = await invokeEdgeFunction<IssuedClaimCode>(supabase, "owner-issue-attempt-claim-code", {
        body: { attempt_id: attemptId },
        requiresAal2: true,
      });
      if (!result?.claim_code) throw new Error("The claim service returned no code.");
      setIssued(result);
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : "Could not issue a claim code.");
    } finally {
      setIsIssuing(false);
    }
  }

  async function copyCode() {
    if (!issued) return;
    await navigator.clipboard.writeText(issued.claim_code);
    setCopied(true);
  }

  return (
    <div className="grid gap-2">
      <Button type="button" variant="secondary" isLoading={isIssuing} onClick={() => void issueCode()}>
        <KeyRound size={15} aria-hidden="true" />
        {issued ? "Replace claim code" : "Issue claim code"}
      </Button>
      {issued ? (
        <div className="rounded-[4px] border border-[#78a86d] bg-[var(--success-bg)] p-3">
          <p className="text-[10px] font-bold uppercase text-[#123d18]">Shown once</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="text-base font-semibold text-[#123d18]">{issued.claim_code}</code>
            <Button type="button" variant="ghost" className="min-h-8 px-2" onClick={() => void copyCode()}>
              {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="mt-1 text-xs text-[#315d36]">Expires {new Date(issued.expires_at).toLocaleString()}.</p>
        </div>
      ) : null}
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
    </div>
  );
}

