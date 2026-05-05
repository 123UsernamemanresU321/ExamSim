import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function invokeEdgeFunctionServer<TResponse>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<TResponse> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error("Signed-in session is required");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");

  const response = await fetch(`${url}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const payload = (await response.json()) as TResponse & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `${functionName} failed`);
  }

  return payload;
}
