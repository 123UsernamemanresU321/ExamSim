export type KmsClient = {
  wrapKey(plaintextDataKey: Uint8Array): Promise<string>;
  unwrapKey(wrappedDataKey: string): Promise<Uint8Array>;
};

export type EncryptedEnvelope = {
  version: 1;
  algorithm: "AES-GCM";
  wrappedDataKey: string;
  iv: string;
  ciphertext: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function encryptEnvelopeJson(value: unknown, kms: KmsClient): Promise<EncryptedEnvelope> {
  const dataKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", dataKey, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(value))),
  );
  return {
    version: 1,
    algorithm: "AES-GCM",
    wrappedDataKey: await kms.wrapKey(dataKey),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  };
}

export async function decryptEnvelopeJson<T = unknown>(envelope: EncryptedEnvelope, kms: KmsClient): Promise<T> {
  const dataKey = await kms.unwrapKey(envelope.wrappedDataKey);
  const key = await crypto.subtle.importKey("raw", new Uint8Array(dataKey), "AES-GCM", false, ["decrypt"]);
  const iv = fromBase64(envelope.iv);
  const ciphertext = fromBase64(envelope.ciphertext);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    key,
    new Uint8Array(ciphertext),
  );
  return JSON.parse(decoder.decode(plaintext)) as T;
}

function toBase64(value: Uint8Array) {
  return Buffer.from(value).toString("base64");
}

function fromBase64(value: string) {
  return Uint8Array.from(Buffer.from(value, "base64"));
}
