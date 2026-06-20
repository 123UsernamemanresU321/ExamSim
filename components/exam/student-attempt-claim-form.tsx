"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { StatusMessage } from "@/components/ui/status-message";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";

type ClaimResult = {
  status: "linked" | "pending";
  attempt_id: string | null;
};

export function StudentAttemptClaimForm() {
  const router = useRouter();
  const [claimCode, setClaimCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingReview, setPendingReview] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPendingReview(false);
    setIsSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const result = await invokeEdgeFunction<ClaimResult>(supabase, "claim-guest-attempt", {
        body: { claim_code: claimCode },
      });
      if (!result) throw new Error("The claim service returned no result.");
      if (result.status === "pending") {
        setPendingReview(true);
        setClaimCode("");
        return;
      }
      router.replace(result.attempt_id ? `/student/attempts/${result.attempt_id}/results` : "/student/results");
      router.refresh();
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : "Could not claim this attempt.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mt-6 grid gap-4" onSubmit={submit}>
      <Field
        label="Result claim code"
        description="Enter the one-time code your teacher issued after feedback was released. This is different from the exam code and your student number."
      >
        <Input
          name="claim_code"
          value={claimCode}
          onChange={(event) => setClaimCode(event.target.value.toUpperCase())}
          placeholder="ABCD-2345"
          autoComplete="one-time-code"
          maxLength={9}
          required
        />
      </Field>
      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
      {pendingReview ? (
        <StatusMessage tone="success">
          Claim submitted. Your teacher must confirm the identity match before this result appears in your account.
        </StatusMessage>
      ) : null}
      <Button type="submit" isLoading={isSubmitting}>Claim returned exam</Button>
    </form>
  );
}

