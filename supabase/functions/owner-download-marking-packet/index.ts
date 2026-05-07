import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { auditOwnerAction, profileForAuthUser, requireOwnerAal2 } from "../_shared/auth.ts";
import { handleOptions, json, readJson } from "../_shared/http.ts";
import { loadNormalizedPackage } from "../_shared/package-storage.ts";

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, admin } = await requireOwnerAal2(request);
    const ownerProfile = await profileForAuthUser(user.id);
    const body = await readJson<{ attempt_id: string }>(request);
    const { data: attempt, error } = await admin.from("attempts").select("*").eq("id", body.attempt_id).single();
    if (error) throw error;
    const [
      { data: responses },
      { data: slots },
      { data: report },
      { data: version },
      { data: questionNodes },
      { data: marks },
      { data: annotations },
      { data: feedbackRelease },
    ] = await Promise.all([
      admin.from("text_responses").select("*").eq("attempt_id", body.attempt_id),
      admin.from("upload_slots").select("*").eq("attempt_id", body.attempt_id),
      admin.from("moderation_reports").select("*").eq("attempt_id", body.attempt_id).maybeSingle(),
      admin
        .from("assessment_versions")
        .select("normalized_package_json, normalized_package_path, encrypted_package_path, kms_provider, wrapped_data_key, encryption_metadata_json")
        .eq("id", attempt.assessment_version_id)
        .single(),
      admin.from("question_nodes").select("*").eq("assessment_version_id", attempt.assessment_version_id).order("ordinal", { ascending: true }),
      admin.from("marks").select("*").eq("attempt_id", body.attempt_id),
      admin.from("submission_annotations").select("*").eq("attempt_id", body.attempt_id),
      admin.from("feedback_releases").select("*").eq("attempt_id", body.attempt_id).maybeSingle(),
    ]);

    const assessmentPackage = version ? await loadNormalizedPackage(admin, version) : null;

    const uploadLinks = [];
    for (const slot of slots ?? []) {
      if (!slot.object_path) continue;
      const { data: signed } = await admin.storage.from("answer-uploads").createSignedUrl(slot.object_path, 300);
      uploadLinks.push({
        question_node_id: slot.question_node_id,
        object_path: slot.object_path,
        signed_url: signed?.signedUrl ?? null,
        expires_in_seconds: 300,
      });
    }

    const manifest = {
      attempt_id: attempt.id,
      generated_at: new Date().toISOString(),
      files: [
        "manifest.json",
        "assessment-package.json",
        "question-tree.json",
        "typed-responses.json",
        "upload-slots.json",
        "upload-download-links.json",
        "moderation-report.json",
        "marks.json",
        "annotations.json",
        "feedback-release.json",
        "audit.json",
      ],
    };
    const audit = {
      exported_by_profile_id: ownerProfile.id,
      exported_by_auth_user_id: user.id,
      browser_mode_note: "Browser Mode evidence is tamper-evident, not tamper-proof.",
    };
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    zip.file("assessment-package.json", JSON.stringify(assessmentPackage, null, 2));
    zip.file("question-tree.json", JSON.stringify(questionNodes ?? [], null, 2));
    zip.file("typed-responses.json", JSON.stringify(responses ?? [], null, 2));
    zip.file("upload-slots.json", JSON.stringify(slots ?? [], null, 2));
    zip.file("upload-download-links.json", JSON.stringify(uploadLinks, null, 2));
    zip.file("moderation-report.json", JSON.stringify(report ?? null, null, 2));
    zip.file("marks.json", JSON.stringify(marks ?? [], null, 2));
    zip.file("annotations.json", JSON.stringify(annotations ?? [], null, 2));
    zip.file("feedback-release.json", JSON.stringify(feedbackRelease ?? null, null, 2));
    zip.file("audit.json", JSON.stringify(audit, null, 2));
    const zipBytes = new Uint8Array(await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" }));

    const objectPathBase = `${ownerProfile.id}/attempts/${attempt.id}/marking-packet-${Date.now()}.zip`;
    const encrypted = await maybeEncryptPacket(zipBytes);
    const objectPath = encrypted ? `${objectPathBase}.enc` : objectPathBase;
    const uploadBody = encrypted?.ciphertextBytes ?? zipBytes;
    const { error: uploadError } = await admin.storage.from("marking-packets").upload(objectPath, uploadBody, {
      contentType: encrypted ? "application/octet-stream" : "application/zip",
      upsert: false,
    });
    if (uploadError) throw uploadError;

    let envelopeId = null;
    if (encrypted) {
      const { data: envelope, error: envelopeError } = await admin
        .from("encrypted_object_envelopes")
        .insert({
          owner_profile_id: ownerProfile.id,
          bucket_id: "marking-packets",
          object_path: objectPath,
          kms_provider: "cloudflare",
          algorithm: "AES-GCM",
          wrapped_data_key: encrypted.wrappedDataKey,
          iv: encrypted.iv,
          metadata_json: { purpose: "marking_packet_zip" },
        })
        .select("id")
        .single();
      if (envelopeError) throw envelopeError;
      envelopeId = envelope.id;
    }

    const { data: exportRow, error: exportError } = await admin
      .from("marking_packet_exports")
      .insert({
        attempt_id: attempt.id,
        owner_profile_id: ownerProfile.id,
        object_path: objectPath,
        encrypted: Boolean(encrypted),
        encrypted_envelope_id: envelopeId,
        manifest_json: manifest,
      })
      .select("*")
      .single();
    if (exportError) throw exportError;
    const { data: download } = await admin.storage.from("marking-packets").createSignedUrl(objectPath, 300);

    const packet = {
      attempt,
      assessment_package: assessmentPackage,
      typed_responses: responses ?? [],
      upload_slots: slots ?? [],
      moderation_report: report,
      marks: marks ?? [],
      annotations: annotations ?? [],
      feedback_release: feedbackRelease,
      marking_packet_zip: {
        object_path: objectPath,
        download_url: download?.signedUrl ?? null,
        expires_in_seconds: 300,
        encrypted: Boolean(encrypted),
        export_id: exportRow.id,
      },
    };
    await auditOwnerAction(ownerProfile.id, user.id, "marking_packet.exported", "attempts", body.attempt_id);
    return json(packet);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "owner-download-marking-packet failed" }, 401);
  }
});

async function maybeEncryptPacket(plaintextBytes: Uint8Array) {
  if (Deno.env.get("EXTERNAL_KMS_PROVIDER") !== "cloudflare") return null;
  const wrapUrl = Deno.env.get("EXTERNAL_KMS_WRAP_URL");
  const adminToken = Deno.env.get("EXTERNAL_KMS_ADMIN_TOKEN");
  if (!wrapUrl || !adminToken) throw new Error("Cloudflare KMS wrapper is not configured");
  const dataKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", dataKey, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new Uint8Array(plaintextBytes)));
  const wrapResponse = await fetch(wrapUrl, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ plaintextDataKey: base64(dataKey) }),
  });
  if (!wrapResponse.ok) throw new Error("Cloudflare KMS key wrap failed");
  const wrapped = await wrapResponse.json();
  if (typeof wrapped.wrappedDataKey !== "string") throw new Error("Cloudflare KMS returned invalid wrapped key");
  return { ciphertextBytes: ciphertext, wrappedDataKey: wrapped.wrappedDataKey, iv: base64(iv) };
}

function base64(value: Uint8Array) {
  return btoa(Array.from(value, (byte) => String.fromCharCode(byte)).join(""));
}
