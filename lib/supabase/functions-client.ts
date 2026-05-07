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

export async function invokePublicEdgeFunction<T>(
  functionName: string,
  options: { body?: Record<string, unknown> } = {},
): Promise<T | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  const response = await fetch(`${url}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(options.body ?? {}),
  });
  if (!response.ok) throw new Error(await edgeFunctionResponseErrorMessage(response));
  if (response.status === 204) return null;
  return await response.json() as T;
}

export async function assertOwnerAal2(supabase: SupabaseClient) {
  await supabase.auth.refreshSession();
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw new Error(error.message);
  if (data.currentLevel !== "aal2") {
    throw new Error("Owner MFA/AAL2 is required. Open Owner > Security and verify MFA for this session, then retry.");
  }
  await supabase.auth.refreshSession();
}

export async function edgeFunctionErrorMessage(error: unknown) {
  const fallback = error instanceof Error ? error.message : "Edge Function request failed.";
  const context = (error as FunctionErrorWithContext | null)?.context;
  if (!context) return fallback;
  return await edgeFunctionResponseErrorMessage(context, fallback);
}

async function edgeFunctionResponseErrorMessage(response: Response, fallback = "Edge Function request failed.") {
  try {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const payload = await response.clone().json() as { error?: unknown; message?: unknown };
      const message = payload.error ?? payload.message;
      if (typeof message === "string" && message.trim()) return message;
    }
    const text = await response.clone().text();
    return text.trim() || fallback;
  } catch {
    return fallback;
  }
}
