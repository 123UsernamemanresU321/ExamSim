type Env = {
  KMS_WRAPPING_KEY: string;
  KMS_ADMIN_TOKEN: string;
};

const worker = {
  async fetch(request: Request, env: Env) {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const provided = request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim();
    if (!provided || provided !== env.KMS_ADMIN_TOKEN) return json({ error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const body = (await request.json()) as Record<string, string>;
    if (url.pathname === "/wrap") {
      const plaintext = fromBase64(body.plaintextDataKey);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await wrappingKey(env);
      const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
      return json({ wrappedDataKey: `${toBase64(iv)}.${toBase64(ciphertext)}` });
    }
    if (url.pathname === "/unwrap") {
      const [iv, ciphertext] = String(body.wrappedDataKey || "").split(".");
      if (!iv || !ciphertext) return json({ error: "Invalid wrappedDataKey" }, 400);
      const key = await wrappingKey(env);
      const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, key, fromBase64(ciphertext));
      return json({ plaintextDataKey: toBase64(new Uint8Array(plaintext)) });
    }
    return json({ error: "Not found" }, 404);
  },
};

export default worker;

async function wrappingKey(env: Env) {
  return crypto.subtle.importKey("raw", fromBase64(env.KMS_WRAPPING_KEY), "AES-GCM", false, ["encrypt", "decrypt"]);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function fromBase64(value = "") {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function toBase64(value: Uint8Array) {
  return btoa(Array.from(value, (byte) => String.fromCharCode(byte)).join(""));
}
