import { describe, expect, it } from "vitest";
import { normalizedJsonTemplate } from "@/lib/json-template";
import {
  aiParseSuggestionSchema,
  buildDeepSeekParseRequest,
  normalizeAiParseWarnings,
} from "@/lib/ai-parse";
import { decryptEnvelopeJson, encryptEnvelopeJson, type KmsClient } from "@/lib/kms";
import { buildMarkingPacketManifest } from "@/lib/marking-packet";
import { getPasskeyApiStatus } from "@/lib/passkeys";
import { normalizedPackageToQtiManifest, qtiManifestToNormalizedPackage } from "@/lib/qti";
import { extractSebKeysFromRecord, validateSebKeys } from "@/lib/seb";

describe("DeepSeek AI parse helpers", () => {
  it("validates review-required normalized package suggestions", () => {
    const suggestion = aiParseSuggestionSchema.parse({
      normalized_package: normalizedJsonTemplate,
      confidence: 0.81,
      warnings: ["Check subquestion marks before publish."],
      review_required: true,
    });

    expect(suggestion.review_required).toBe(true);
    expect(suggestion.normalized_package.questions[0]?.node_key).toBe("1");
  });

  it("builds a DeepSeek JSON-only parse request without exposing secrets", () => {
    const request = buildDeepSeekParseRequest({
      sourceKind: "latex",
      title: "IB Paper",
      sourceText: "\\section*{A}\\nQuestion 1. Prove that x^2 \\ge 0.",
      model: "deepseek-v4-flash",
    });

    expect(request.model).toBe("deepseek-v4-flash");
    expect(request.response_format).toEqual({ type: "json_object" });
    expect(JSON.stringify(request)).not.toMatch(/api[_-]?key|secret/i);
  });

  it("normalizes empty AI warning output to an owner-review warning", () => {
    expect(normalizeAiParseWarnings([])).toContain("Owner review is mandatory before publish.");
  });
});

describe("SEB validation helpers", () => {
  it("accepts matching Browser Exam Key and Config Key hashes", () => {
    expect(
      validateSebKeys({
        expectedBrowserExamKeyHashes: ["bek-1"],
        expectedConfigKeyHashes: ["ck-1"],
        receivedBrowserExamKeyHash: "bek-1",
        receivedConfigKeyHash: "ck-1",
      }),
    ).toEqual({ ok: true });
  });

  it("rejects missing or unexpected SEB hashes", () => {
    expect(validateSebKeys({ expectedBrowserExamKeyHashes: ["bek"], expectedConfigKeyHashes: ["ck"] }).ok).toBe(false);
    expect(
      validateSebKeys({
        expectedBrowserExamKeyHashes: ["bek"],
        expectedConfigKeyHashes: ["ck"],
        receivedBrowserExamKeyHash: "wrong",
        receivedConfigKeyHash: "ck",
      }).ok,
    ).toBe(false);
  });

  it("extracts SEB hashes from header-like records and JS API payloads", () => {
    expect(
      extractSebKeysFromRecord({
        "x-safeexambrowser-browserexamkeyhash": "bek",
        "x-safeexambrowser-configkeyhash": "ck",
      }),
    ).toEqual({ browserExamKeyHash: "bek", configKeyHash: "ck" });
    expect(extractSebKeysFromRecord({ seb_browser_exam_key_hash: "bek2", seb_config_key_hash: "ck2" })).toEqual({
      browserExamKeyHash: "bek2",
      configKeyHash: "ck2",
    });
  });
});

describe("QTI mapping helpers", () => {
  it("exports a normalized package to a conservative QTI manifest", () => {
    const manifest = normalizedPackageToQtiManifest(normalizedJsonTemplate);
    expect(manifest.identifier).toBe("exam-vault-template");
    expect(manifest.items.map((item) => item.identifier)).toContain("1");
  });

  it("imports a QTI manifest into a review-required normalized package draft", () => {
    const draft = qtiManifestToNormalizedPackage({
      identifier: "qti-demo",
      title: "QTI Demo",
      items: [{ identifier: "item-1", title: "Question 1", responseMode: "typed_text", marks: 5 }],
    });
    expect(draft.source.requires_owner_review).toBe(true);
    expect(draft.questions[0]?.node_key).toBe("item-1");
  });
});

describe("Cloudflare KMS envelope helpers", () => {
  it("encrypts and decrypts JSON through a KMS wrapped data key", async () => {
    const kms: KmsClient = {
      async wrapKey(plaintextDataKey) {
        return `wrapped:${Buffer.from(plaintextDataKey).toString("base64")}`;
      },
      async unwrapKey(wrappedDataKey) {
        return Uint8Array.from(Buffer.from(wrappedDataKey.replace(/^wrapped:/, ""), "base64"));
      },
    };

    const envelope = await encryptEnvelopeJson({ ok: true, id: "packet" }, kms);
    expect(envelope.ciphertext).not.toContain("packet");
    expect(await decryptEnvelopeJson(envelope, kms)).toEqual({ ok: true, id: "packet" });
  });
});

describe("marking packet and passkey helpers", () => {
  it("builds a ZIP manifest with owner-only packet sections", () => {
    const manifest = buildMarkingPacketManifest({
      attemptId: "attempt-1",
      uploadSlots: [{ question_node_id: "q1", object_path: "answer-uploads/a.pdf", status: "uploaded" }],
      typedResponses: [{ question_node_id: "q2", answer_text: "x=1" }],
      marks: [{ awarded_marks: 7 }],
    });

    expect(manifest.files).toContain("manifest.json");
    expect(manifest.files).toContain("typed-responses.json");
    expect(manifest.files).toContain("upload-slots.json");
    expect(manifest.totalAwardedMarks).toBe(7);
  });

  it("detects current Supabase passkey namespace with fallback", () => {
    expect(getPasskeyApiStatus({ passkey: { register: async () => ({ data: null, error: null }) } }).available).toBe(true);
    expect(getPasskeyApiStatus({}).available).toBe(false);
  });
});
