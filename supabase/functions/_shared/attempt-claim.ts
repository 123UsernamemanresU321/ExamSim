const encoder = new TextEncoder();
const CLAIM_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeAttemptClaimCode(value: string) {
  const compact = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!compact) return "";
  return compact.match(/.{1,4}/g)?.join("-") ?? compact;
}

export function isAttemptClaimCode(value: string) {
  return /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(normalizeAttemptClaimCode(value));
}

export function generateAttemptClaimCode(randomBytes?: Uint8Array) {
  const bytes = randomBytes ?? crypto.getRandomValues(new Uint8Array(8));
  if (bytes.length < 8) throw new Error("Eight random bytes are required");
  const characters = Array.from(bytes.slice(0, 8), (byte) => CLAIM_ALPHABET[byte % CLAIM_ALPHABET.length]);
  return `${characters.slice(0, 4).join("")}-${characters.slice(4).join("")}`;
}

export async function hashAttemptClaimCode(value: string) {
  const normalized = normalizeAttemptClaimCode(value);
  if (!isAttemptClaimCode(normalized)) throw new Error("Enter a valid claim code");
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(normalized)));
}

export function attemptClaimExpiry(now = new Date(), lifetimeSeconds = 7 * 24 * 60 * 60) {
  if (!Number.isFinite(lifetimeSeconds) || lifetimeSeconds < 300 || lifetimeSeconds > 30 * 24 * 60 * 60) {
    throw new Error("Claim-code lifetime must be between 5 minutes and 30 days");
  }
  return new Date(now.getTime() + lifetimeSeconds * 1000).toISOString();
}

