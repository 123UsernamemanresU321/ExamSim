import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1";
import { extractSebKeys, validateSebKeys } from "../_shared/seb.ts";

serve(async (req) => {
  const url = new URL(req.url);
  const attemptId = url.searchParams.get("attempt_id");
  const returnUrl = url.searchParams.get("return_url");

  if (!attemptId || !returnUrl) {
    return new Response("Missing attempt_id or return_url", { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // 1. Fetch the attempt to get expected hashes
    const { data: attempt, error: attemptError } = await supabase
      .from("attempts")
      .select("seb_browser_exam_key_hashes, seb_config_key_hashes")
      .eq("id", attemptId)
      .single();

    if (attemptError || !attempt) throw new Error("Attempt not found");

    // 2. Extract keys from headers (Safe Exam Browser will send these to this Edge Function)
    const keys = extractSebKeys(req);
    
    // 3. Validate
    const validation = validateSebKeys({
      expectedBrowserExamKeyHashes: attempt.seb_browser_exam_key_hashes,
      expectedConfigKeyHashes: attempt.seb_config_key_hashes,
      receivedBrowserExamKeyHash: keys.browserExamKeyHash,
      receivedConfigKeyHash: keys.configKeyHash,
    });

    if (validation.ok) {
      // 4. Record verification in the session associated with the state token
      const stateToken = url.searchParams.get("state_token");
      if (stateToken) {
        try {
          const { verifyStateToken } = await import("../_shared/state-token.ts");
          const tokenPayload = await verifyStateToken(stateToken);
          
          if (tokenPayload?.attempt_session_id) {
            await supabase
              .from("attempt_sessions")
              .update({
                seb_verified: true,
                browser_exam_key_hash: keys.browserExamKeyHash,
                config_key_hash: keys.configKeyHash,
              })
              .eq("id", tokenPayload.attempt_session_id);
          }
        } catch (e) {
          console.warn("State token verification failed during handshake, but SEB keys were valid.", e);
        }
      }
    }

    // 5. Redirect back regardless (the UI will handle the result based on the DB state)
    // We add a query param so the UI knows we just came back from a handshake
    const finalReturnUrl = new URL(returnUrl);
    finalReturnUrl.searchParams.set("seb_handshake", validation.ok ? "success" : "failed");
    if (!validation.ok) finalReturnUrl.searchParams.set("seb_error", validation.reason || "unknown");

    return new Response(null, {
      status: 302,
      headers: { Location: finalReturnUrl.toString() },
    });
  } catch (error) {
    console.error("Handshake failed:", error);
    return new Response(`Handshake error: ${error instanceof Error ? error.message : "Unknown"}`, { status: 500 });
  }
});
