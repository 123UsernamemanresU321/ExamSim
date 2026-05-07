import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { normalizedJsonTemplate } from "@/lib/json-template";
import {
  aiParseSuggestionSchema,
  buildDeepSeekParseRequest,
  normalizeAiParseWarnings,
} from "@/lib/ai-parse";
import { decryptEnvelopeJson, encryptEnvelopeJson, type KmsClient } from "@/lib/kms";
import { buildMarkingPacketManifest } from "@/lib/marking-packet";
import {
  buildMineruBatchRequest,
  extractMineruUploadUrls,
  normalizeMineruBatchSubmitResponse,
  pickMineruExtractResult,
} from "@/lib/mineru-hosted";
import { getPasskeyApiStatus } from "@/lib/passkeys";
import { normalizedPackageToQtiManifest, qtiManifestToNormalizedPackage } from "@/lib/qti";
import { extractSebKeysFromRecord, validateSebKeys } from "@/lib/seb";
import { edgeFunctionErrorMessage, invokePublicEdgeFunction } from "@/lib/supabase/functions-client";

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

describe("MinerU hosted API helpers", () => {
  it("builds signed-url batch requests without API secrets", () => {
    const request = buildMineruBatchRequest({
      dataId: "parse-job-1",
      signedUrl: "https://supabase.example/signed.pdf",
      modelVersion: "vlm",
      language: "en",
    });

    expect(request.files[0]).toMatchObject({ url: "https://supabase.example/signed.pdf", is_ocr: true, data_id: "parse-job-1" });
    expect(JSON.stringify(request)).not.toMatch(/api[_-]?key|bearer|secret/i);
  });

  it("normalizes hosted batch submission responses and upload URLs", () => {
    const submission = normalizeMineruBatchSubmitResponse({
      code: 0,
      trace_id: "trace-1",
      data: { batch_id: "batch-1", file_urls: ["https://upload.example/file"] },
    });
    expect(submission.batchId).toBe("batch-1");
    expect(submission.uploadUrls).toEqual(["https://upload.example/file"]);
    expect(extractMineruUploadUrls({ files: [{ upload_url: "https://upload.example/2" }] })).toEqual(["https://upload.example/2"]);
  });

  it("picks completed hosted MinerU results by data_id", () => {
    const result = pickMineruExtractResult(
      {
        code: 0,
        data: {
          extract_result: [
            { data_id: "other", state: "running" },
            { data_id: "parse-job-1", state: "done", full_zip_url: "https://download.example/result.zip" },
          ],
        },
      },
      "parse-job-1",
    );

    expect(result.state).toBe("done");
    expect(result.fullZipUrl).toBe("https://download.example/result.zip");
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

describe("Edge Function client error handling", () => {
  it("extracts JSON error bodies from Supabase non-2xx responses", async () => {
    const error = new Error("Edge Function returned a non-2xx status code") as Error & { context: Response };
    error.context = new Response(JSON.stringify({ error: "Owner MFA/AAL2 required for this action" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });

    await expect(edgeFunctionErrorMessage(error)).resolves.toBe("Owner MFA/AAL2 required for this action");
  });

  it("uses anon apikey without bearer authorization for public Edge Function calls", async () => {
    const originalFetch = global.fetch;
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    global.fetch = (async (_url, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("apikey")).toBe("anon-key");
      expect(headers.get("authorization")).toBeNull();
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    try {
      await expect(invokePublicEdgeFunction("activate-student", { body: { login_code: "STU-1" } })).resolves.toEqual({
        ok: true,
      });
    } finally {
      global.fetch = originalFetch;
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
    }
  });
});

describe("async form safety", () => {
  it("does not reset React currentTarget after awaited owner actions", () => {
    const asyncOwnerForms = [
      "components/owner/create-student-form.tsx",
      "components/owner/create-student-group-form.tsx",
      "components/auth/mfa-panel.tsx",
    ];

    for (const filePath of asyncOwnerForms) {
      const source = readFileSync(filePath, "utf8");
      expect(source).not.toContain("event.currentTarget.reset()");
      expect(source).toContain("const formElement = event.currentTarget");
      expect(source).toContain("formElement.reset()");
    }
  });
});

describe("production UI wiring", () => {
  it("does not link students to demo attempt ids from production navigation", () => {
    const source = readFileSync("app/student/layout.tsx", "utf8");
    expect(source).not.toContain("/student/attempts/att_active/exam");
    expect(source).toContain("Assigned attempts");
  });

  it("uses a real PDF file picker for assessment source uploads", () => {
    const source = readFileSync("components/owner/new-assessment-form.tsx", "utf8");
    expect(source).toContain('name="pdf_source"');
    expect(source).toContain('type="file"');
    expect(source).toContain("pdf_source_base64");
    expect(source).not.toContain('name="uploaded_source_path"');
  });
});
