import type { AttemptState } from "./attempt-state.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64Url(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlJson(data: unknown) {
  return base64Url(encoder.encode(JSON.stringify(data)));
}

function base64UrlToBytes(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
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
  return JSON.parse(decoder.decode(base64UrlToBytes(body))) as StateTokenPayload;
}

export async function verifyStateToken(token: string): Promise<StateTokenPayload> {
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) throw new Error("Invalid state token");
  const ok = await crypto.subtle.verify(
    "HMAC",
    await signingKey(),
    base64UrlToBytes(signature),
    encoder.encode(`${header}.${body}`),
  );
  if (!ok) throw new Error("Invalid state token signature");
  const payload = decodeStateTokenPayload(token);
  if (Date.parse(payload.expires_at_utc) <= Date.now()) throw new Error("State token expired");
  return payload;
}
