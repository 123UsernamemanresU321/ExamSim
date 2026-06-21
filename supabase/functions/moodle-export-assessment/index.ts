import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertInstitutionOwner, auditOwnerAction, requireInstitutionAal2 } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json, readJson } from "../_shared/http.ts";

type Body = { assessment_version_id?: string };

serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    const { user, profile, admin, ownerProfileId } = await requireInstitutionAal2(request, "exports");
    const body = await readJson<Body>(request);
    const versionId = String(body.assessment_version_id ?? "").trim();
    if (!versionId) return json(request, { error: "assessment_version_id is required" }, 400);
    const { data: version, error: versionError } = await admin.from("assessment_versions").select("id,status,assessment_id,assessments(title,paper_code,owner_profile_id)").eq("id", versionId).maybeSingle();
    if (versionError) throw versionError;
    if (!version) return json(request, { error: "Assessment version not found" }, 404);
    const assessment = Array.isArray(version.assessments) ? version.assessments[0] : version.assessments;
    assertInstitutionOwner(assessment?.owner_profile_id, ownerProfileId);
    if (version.status !== "published") return json(request, { error: "Review and publish the assessment before Moodle XML export" }, 409);
    const { data: questions, error: questionError } = await admin.from("question_nodes").select("id,node_key,display_label,title,prompt_html,prompt_latex,marks,response_mode,interaction_json,source_page_start,source_page_end").eq("assessment_version_id", version.id).in("node_type", ["question", "subquestion", "part"]).order("ordinal_path");
    if (questionError) throw questionError;
    const fidelityWarnings = collectWarnings(questions ?? []);
    const xml = buildMoodleXml({ title: assessment?.title ?? "Exam Vault assessment", paperCode: assessment?.paper_code ?? null, questions: questions ?? [], fidelityWarnings });
    const path = `${ownerProfileId}/moodle/${version.id}/moodle-export-${Date.now()}.xml`;
    const { error: uploadError } = await admin.storage.from("marking-packets").upload(path, new TextEncoder().encode(xml), { contentType: "application/xml", upsert: false });
    if (uploadError) throw uploadError;
    const { data: signed, error: signedError } = await admin.storage.from("marking-packets").createSignedUrl(path, 300);
    if (signedError) throw signedError;
    const { error: historyError } = await admin.from("export_download_history").insert({ owner_profile_id: ownerProfileId, actor_profile_id: profile.id, assessment_id: version.assessment_id, export_kind: "moodle_xml", format: "XML", object_path: path, row_count: questions?.length ?? 0, status: "review_required", fidelity_warnings_json: fidelityWarnings, metadata_json: { assessment_version_id: version.id } });
    if (historyError) throw historyError;
    await auditOwnerAction(ownerProfileId, user.id, "moodle.exported", "assessment_versions", version.id, { object_path: path, item_count: questions?.length ?? 0, fidelity_warnings: fidelityWarnings });
    return json(request, { ok: true, download_url: signed?.signedUrl ?? null, expires_in_seconds: 300, review_required: true, fidelity_warnings: fidelityWarnings });
  } catch (error) {
    return errorResponse(request, error, "moodle-export-assessment failed");
  }
});

function collectWarnings(questions: Array<{ response_mode?: string | null }>) {
  const warnings = new Set<string>([
    "Moodle XML is a conservative handoff. Re-open the imported quiz in Moodle and verify every question before use.",
    "Exam Vault source regions, private source files, rubrics, whiteboard state, table schemas, and upload rules are preserved only as metadata or warnings, not executable Moodle behavior.",
  ]);
  for (const question of questions) {
    if (!["typed_text", "none"].includes(String(question.response_mode ?? "none"))) warnings.add(`Response mode ${question.response_mode} is exported as a manually graded essay question.`);
  }
  return [...warnings];
}

function buildMoodleXml(input: { title: string; paperCode: string | null; questions: Array<Record<string, unknown>>; fidelityWarnings: string[] }) {
  const category = escapeXml(`${input.paperCode ?? "Exam Vault"} / ${input.title}`);
  const body = input.questions.map((question, index) => {
    const key = String(question.display_label ?? question.node_key ?? `Question ${index + 1}`);
    const prompt = sanitizeMoodlePrompt(String(question.prompt_html ?? question.prompt_latex ?? question.title ?? key));
    const marks = Math.max(0, Number(question.marks ?? 0));
    const metadata = escapeXml(JSON.stringify({ examsim_node_key: question.node_key, response_mode: question.response_mode, source_page_start: question.source_page_start, source_page_end: question.source_page_end }));
    return `<question type="essay"><name><text>${escapeXml(key)}</text></name><questiontext format="html"><text><![CDATA[${cdata(prompt)}]]></text></questiontext><defaultgrade>${marks}</defaultgrade><penalty>0</penalty><hidden>0</hidden><idnumber>${escapeXml(String(question.node_key ?? ""))}</idnumber><generalfeedback format="html"><text><![CDATA[<p>Exam Vault import metadata: ${metadata}</p>]]></text></generalfeedback><responseformat>editor</responseformat><responserequired>0</responserequired><responsefieldlines>12</responsefieldlines><attachments>1</attachments><attachmentsrequired>0</attachmentsrequired></question>`;
  }).join("");
  const warningQuestion = `<question type="description"><name><text>Exam Vault fidelity warnings</text></name><questiontext format="html"><text><![CDATA[<ul>${input.fidelityWarnings.map((warning) => `<li>${escapeXml(warning)}</li>`).join("")}</ul>]]></text></questiontext></question>`;
  return `<?xml version="1.0" encoding="UTF-8"?><quiz><question type="category"><category><text>$course$/top/${category}</text></category></question>${warningQuestion}${body}</quiz>`;
}

function sanitizeMoodlePrompt(value: string) { return `<p>${escapeXml(stripHtml(value))}</p>`; }
function stripHtml(value: string) { return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }
function cdata(value: string) { return value.replaceAll("]]>", "]]]]><![CDATA[>"); }
function escapeXml(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;"); }
