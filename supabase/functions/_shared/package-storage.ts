type PackageVersion = {
  normalized_package_json?: unknown;
  normalized_package_path?: string | null;
  encrypted_package_path?: string | null;
  kms_provider?: string | null;
  wrapped_data_key?: string | null;
  encryption_metadata_json?: Record<string, unknown> | null;
};

type StorageAdmin = {
  storage: {
    from(bucket: string): {
      download(path: string): Promise<{ data: Blob | null; error: Error | null }>;
    };
  };
};

export async function loadNormalizedPackage(admin: StorageAdmin, version: PackageVersion) {
  if (version.normalized_package_json) return version.normalized_package_json;
  if (version.encrypted_package_path) return await loadEncryptedPackage(admin, version);
  if (version.normalized_package_path) {
    const { data, error } = await admin.storage.from("assessment-packages").download(version.normalized_package_path);
    if (error) throw error;
    if (!data) throw new Error("Normalized package object is missing");
    return JSON.parse(await data.text());
  }
  return null;
}

async function loadEncryptedPackage(admin: StorageAdmin, version: PackageVersion) {
  if (version.kms_provider !== "cloudflare") throw new Error("Unsupported package KMS provider");
  if (!version.encrypted_package_path || !version.wrapped_data_key) throw new Error("Encrypted package metadata is incomplete");
  const unwrapUrl = Deno.env.get("EXTERNAL_KMS_UNWRAP_URL");
  const adminToken = Deno.env.get("EXTERNAL_KMS_ADMIN_TOKEN");
  if (!unwrapUrl || !adminToken) throw new Error("Cloudflare KMS unwrap is not configured");

  const { data, error } = await admin.storage.from("assessment-packages").download(version.encrypted_package_path);
  if (error) throw error;
  if (!data) throw new Error("Encrypted package object is missing");

  const unwrapResponse = await fetch(unwrapUrl, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ wrappedDataKey: version.wrapped_data_key }),
  });
  if (!unwrapResponse.ok) throw new Error("Cloudflare KMS key unwrap failed");
  const unwrapped = await unwrapResponse.json();
  if (typeof unwrapped.plaintextDataKey !== "string") throw new Error("Cloudflare KMS returned invalid data key");

  const iv = typeof version.encryption_metadata_json?.iv === "string" ? version.encryption_metadata_json.iv : "";
  if (!iv) throw new Error("Encrypted package IV is missing");
  const key = await crypto.subtle.importKey("raw", fromBase64(unwrapped.plaintextDataKey), "AES-GCM", false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    key,
    new Uint8Array(await data.arrayBuffer()),
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
