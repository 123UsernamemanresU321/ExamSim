import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { requireOwner } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { admin } = await requireOwner(request);
    const body = await readJson<{ attempt_id: string }>(request);
    const { data, error } = await admin.rpc("generate_moderation_summary", { target_attempt_id: body.attempt_id });
    if (error) throw error;
    return json({ attempt_id: body.attempt_id, summary: data });
  } catch (error) {
    return errorResponse(error, "summarize-attempt-report failed");
  }
});
