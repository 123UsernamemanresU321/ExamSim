import { normalizedJsonTemplate } from "@/lib/json-template";
import { flattenQuestionNodes, type NormalizedAssessmentPackage } from "@/lib/assessment-package";

export type QtiManifestItem = {
  identifier: string;
  title: string;
  responseMode: "typed_text" | "multiple_choice" | "upload_pdf" | "typed_or_upload" | "none";
  marks?: number;
};

export type QtiManifest = {
  identifier: string;
  title: string;
  items: QtiManifestItem[];
};

export function normalizedPackageToQtiManifest(pkg: NormalizedAssessmentPackage): QtiManifest {
  const identifier =
    pkg.assessment.id === "replace-with-assessment-id" || pkg.assessment.id === "assess_unique_id"
      ? "exam-vault-template"
      : slugIdentifier(pkg.assessment.paper_code || pkg.assessment.title || pkg.assessment.id);
  return {
    identifier,
    title: pkg.assessment.title,
    items: flattenQuestionNodes(pkg.questions)
      .filter((node) => node.node_type !== "section")
      .map((node) => ({
        identifier: node.node_key,
        title: node.title || `Question ${node.node_key}`,
        responseMode: node.response_mode,
        marks: node.marks,
      })),
  };
}

function slugIdentifier(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function qtiManifestToNormalizedPackage(manifest: QtiManifest): NormalizedAssessmentPackage {
  return {
    ...normalizedJsonTemplate,
    assessment: {
      ...normalizedJsonTemplate.assessment,
      id: manifest.identifier,
      title: manifest.title,
      paper_code: manifest.identifier,
      source_kind: "json",
      authoring_origin: "imported",
    },
    source: {
      normalized_by: "qti-import:mvp",
      parse_confidence: 0.78,
      requires_owner_review: true,
    },
    questions: manifest.items.map((item, index) => ({
      node_id: item.identifier,
      node_key: item.identifier,
      ordinal: index + 1,
      node_type: "question",
      title: item.title,
      marks: item.marks,
      response_mode: item.responseMode,
      prompt: {
        html: `<p>${escapeHtml(item.title)}</p>`,
      },
    })),
  };
}

export function qtiManifestXml(manifest: QtiManifest) {
  const items = manifest.items
    .map(
      (item) =>
        `<resource identifier="${escapeXml(item.identifier)}" type="imsqti_item_xmlv2p1" href="items/${escapeXml(item.identifier)}.xml"/>`,
    )
    .join("");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<manifest xmlns="http://www.imsglobal.org/xsd/imscp_v1p1" xmlns:imsqti="http://www.imsglobal.org/xsd/imsqti_v2p1" identifier="' +
      escapeXml(manifest.identifier) +
      '">',
    "<resources>",
    items,
    "</resources>",
    "</manifest>",
  ].join("");
}

export function qtiItemXml(item: QtiManifestItem) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<assessmentItem xmlns="http://www.imsglobal.org/xsd/imsqti_v2p1" identifier="${escapeXml(item.identifier)}" title="${escapeXml(item.title)}" adaptive="false" timeDependent="false">`,
    "<itemBody>",
    `<p>${escapeXml(item.title)}</p>`,
    "</itemBody>",
    "</assessmentItem>",
  ].join("");
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
