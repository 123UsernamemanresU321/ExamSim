import type { SupabaseClient } from "@supabase/supabase-js";

type InvokeOptions = {
  body?: EdgeFunctionBody;
  requiresAal2?: boolean;
};

type EdgeFunctionBody =
  | Record<string, unknown>
  | string
  | FormData
  | Blob
  | ArrayBuffer
  | ReadableStream<Uint8Array>
  | File;

type FunctionErrorWithContext = Error & {
  context?: Response;
};

export async function invokeEdgeFunction<T>(
  supabase: SupabaseClient,
  functionName: string,
  options: InvokeOptions = {},
): Promise<T | null> {
  if (options.requiresAal2) await assertOwnerAal2(supabase);
  const { data, error } = await supabase.functions.invoke<T>(functionName, { body: options.body });
  if (error) throw new Error(await edgeFunctionErrorMessage(error));
  return data ?? null;
}

export async function assertOwnerAal2(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw new Error(error.message);
  if (data.currentLevel !== "aal2") {
    throw new Error("Owner MFA/AAL2 is required. Open Owner > Security and verify MFA for this session, then retry.");
  }
}

export async function edgeFunctionErrorMessage(error: unknown) {
  const fallback = error instanceof Error ? error.message : "Edge Function request failed.";
  const context = (error as FunctionErrorWithContext | null)?.context;
  if (!context) return fallback;
  try {
    const contentType = context.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const payload = await context.clone().json() as { error?: unknown; message?: unknown };
      const message = payload.error ?? payload.message;
      if (typeof message === "string" && message.trim()) return message;
    }
    const text = await context.clone().text();
    return text.trim() || fallback;
  } catch {
    return fallback;
  }
}
