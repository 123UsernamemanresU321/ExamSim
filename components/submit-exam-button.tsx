"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";

export function SubmitExamButton({ attemptId, stateToken }: { attemptId: string; stateToken: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit() {
    if (!confirm("Are you sure you want to end your writing time early? You will not be able to change your typed answers after this.")) {
      return;
    }

    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    try {
      await invokeEdgeFunction(supabase, "finalize-attempt", {
        body: { attempt_id: attemptId, state_token: stateToken },
      });
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not submit exam.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button 
      className="w-full mt-2" 
      variant="primary" 
      onClick={handleSubmit} 
      disabled={loading}
    >
      <Send size={16} />
      {loading ? "Submitting..." : "End writing and submit"}
    </Button>
  );
}
