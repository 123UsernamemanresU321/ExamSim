import type { AttemptState } from "./attempt-state.ts";

const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlJson(data: unknown) {
  return base64Url(encoder.encode(JSON.stringify(data)));
}

async function signingKey() {
  const secret = Deno.env.get("ATTEMPT_STATE_TOKEN_SECRET");
  if (!secret) throw new Error("Missing ATTEMPT_STATE_TOKEN_SECRET");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export type StateTokenPayload = {
  token_id: string;
  attempt_id: string;
  profile_id: string;
  attempt_session_id?: string;
  computed_state: AttemptState;
  server_now_utc: string;
  expires_at_utc: string;
  delivery_mode: "browser" | "seb_required";
  seb_verified: boolean;
};

export async function signStateToken(payload: StateTokenPayload) {
  const header = base64UrlJson({ alg: "HS256", typ: "EVST" });
  const body = base64UrlJson(payload);
  const signature = await crypto.subtle.sign("HMAC", await signingKey(), encoder.encode(`${header}.${body}`));
  return `${header}.${body}.${base64Url(new Uint8Array(signature))}`;
}

export function decodeStateTokenPayload(token: string): StateTokenPayload {
  const [, body] = token.split(".");
  if (!body) throw new Error("Invalid state token");
  const normalized = body.replaceAll("-", "+").replaceAll("_", "/");
  return JSON.parse(atob(normalized)) as StateTokenPayload;
}
