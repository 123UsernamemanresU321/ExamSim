import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { assertInstitutionOwner, auditOwnerAction, requireInstitutionAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";
import { loadNormalizedPackage } from "../_shared/package-storage.ts";

type Body = {
  assessment_version_id: string;
};

type QtiQuestion = {
  node_key?: string;
  title?: string;
  response_mode?: string;
  children?: QtiQuestion[];
};

type AssessmentRelation = {
  id: string;
  title: string;
  paper_code: string | null;
  owner_profile_id: string;
};

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, profile, admin, ownerProfileId } = await requireInstitutionAal2(request, "exports");
    const body = await readJson<Body>(request);
    if (!body.assessment_version_id) return json(request, { error: "assessment_version_id is required" }, 400);

    const { data: version, error: versionError } = await admin
      .from("assessment_versions")
      .select("id, normalized_package_json, normalized_package_path, encrypted_package_path, kms_provider, wrapped_data_key, encryption_metadata_json, assessments(id,title,paper_code,owner_profile_id)")
      .eq("id", body.assessment_version_id)
      .single();
    if (versionError) throw versionError;
    const assessment = normalizeAssessmentRelation(version.assessments);
    assertInstitutionOwner(assessment?.owner_profile_id, ownerProfileId);
    const pkg = await loadNormalizedPackage(admin, version) as {
      assessment?: { title?: string; paper_code?: string };
      questions?: QtiQuestion[];
    };
    const title = pkg.assessment?.title || assessment?.title || "Exam Vault assessment";
    const identifier = slug(pkg.assessment?.paper_code || title || version.id);
    const items = flattenQuestions(pkg.questions ?? []);

    const zip = new JSZip();
    zip.file(
      "imsmanifest.xml",
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<manifest xmlns="http://www.imsglobal.org/xsd/imscp_v1p1" identifier="${escapeXml(identifier)}">`,
        "<resources>",
        items.map((item) => `<resource identifier="${escapeXml(item.node_key)}" type="imsqti_item_xmlv2p1" href="items/${escapeXml(item.node_key)}.xml"/>`).join(""),
        "</resources>",
        "</manifest>",
      ].join(""),
    );
    for (const item of items) {
      zip.file(
        `items/${item.node_key}.xml`,
        [
          '<?xml version="1.0" encoding="UTF-8"?>',
          `<assessmentItem xmlns="http://www.imsglobal.org/xsd/imsqti_v2p1" identifier="${escapeXml(item.node_key)}" title="${escapeXml(item.title || item.node_key)}" adaptive="false" timeDependent="false">`,
          "<itemBody>",
          `<p>${escapeXml(item.title || item.node_key)}</p>`,
          "</itemBody>",
          "</assessmentItem>",
        ].join(""),
      );
    }
    zip.file("exam-vault-normalized-package.json", JSON.stringify(pkg, null, 2));
    const bytes = new Uint8Array(await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" }));
    const path = `${ownerProfileId}/qti/${version.id}/qti-export-${Date.now()}.zip`;
    const { error: uploadError } = await admin.storage.from("marking-packets").upload(path, bytes, {
      contentType: "application/zip",
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data: signed } = await admin.storage.from("marking-packets").createSignedUrl(path, 300);
    await auditOwnerAction(ownerProfileId, user.id, "qti.exported", "assessment_versions", version.id, {
      object_path: path,
      item_count: items.length,
    });
    const qtiWarnings = ["QTI export includes the normalized Exam Vault package for fidelity review. Unsupported response interactions require review after import."];
    const { error: historyError } = await admin.from("export_download_history").insert({ owner_profile_id: ownerProfileId, actor_profile_id: profile.id, assessment_id: assessment?.id ?? null, export_kind: "qti_zip", format: "ZIP", object_path: path, row_count: items.length, status: "review_required", fidelity_warnings_json: qtiWarnings, metadata_json: { assessment_version_id: version.id } });
    if (historyError) throw historyError;
    return json(request, { ok: true, object_path: path, download_url: signed?.signedUrl ?? null, expires_in_seconds: 300, review_required: true, fidelity_warnings: qtiWarnings });
  } catch (error) {
    return errorResponse(request, error, "qti-export-assessment failed");
  }
});

function flattenQuestions(nodes: QtiQuestion[]): { node_key: string; title?: string }[] {
  return nodes.flatMap((node, index) => [
    { node_key: node.node_key || `item-${index + 1}`, title: node.title },
    ...flattenQuestions(Array.isArray(node.children) ? node.children : []),
  ]);
}

function normalizeAssessmentRelation(value: unknown): AssessmentRelation | null {
  if (Array.isArray(value)) return value[0] as AssessmentRelation | undefined ?? null;
  return value as AssessmentRelation | null;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "exam-vault";
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
