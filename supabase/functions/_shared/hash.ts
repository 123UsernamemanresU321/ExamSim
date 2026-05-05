export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomCode(prefix: string, bytes = 4) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return `${prefix}-${Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}
