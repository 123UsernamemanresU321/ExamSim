import { createHash, createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { classifyProviderFailure, evaluateExtractedPaperText, evaluatePaperPackage } from "./lib/smart-import-qa.mjs";
import { retryingFetch } from "./lib/network-retry.mjs";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1).replace(/^['"]|['"]$/g, "");
    process.env[key] ??= value;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

const [paperArgument, markschemeArgument, handwritingArgument] = process.argv.slice(2);
if (!paperArgument || !markschemeArgument || !handwritingArgument) {
  throw new Error("Usage: npm run qa:smart-import -- <paper.pdf> <markscheme.pdf> <handwriting.pdf>");
}
const paperPath = resolve(paperArgument);
const markschemePath = resolve(markschemeArgument);
const handwritingPath = resolve(handwritingArgument);
if (!existsSync(handwritingPath)) throw new Error(`QA handwriting input does not exist: ${handwritingPath}`);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceRoleKey) throw new Error("Supabase QA configuration is incomplete");

const credentialsPath = resolve(process.cwd(), ".qa-accounts.local.json");
if (!existsSync(credentialsPath)) throw new Error("Run npm run provision:qa before live Smart Import QA");
const credentials = JSON.parse(readFileSync(credentialsPath, "utf8"));
const ownerAccount = credentials.accounts?.find((account) => account.kind === "owner");
if (!ownerAccount?.email || !ownerAccount?.password || !ownerAccount?.totp_secret || !ownerAccount?.totp_factor_id) {
  throw new Error("Synthetic QA owner credentials or MFA evidence are missing");
}

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: retryingFetch },
};
const admin = createClient(url, serviceRoleKey, clientOptions);
const ownerClient = createClient(url, anonKey, clientOptions);
const expected = {
  expectedQuestionCount: 12,
  expectedTotalMarks: 110,
  sectionAEnd: 9,
  sectionBStart: 10,
  requiredPrompts: {
    "1(c)": ["sketch", "graph"],
    "4": ["roof", "diagram"],
    "7": ["seat", "diagram"],
    "10": ["population", "table"],
    "12(f)": ["sketch", "asymptote"],
  },
};

const temporaryDirectory = mkdtempSync(join(tmpdir(), "exam-vault-smart-import-qa-"));
try {
  await establishOwnerAal2();
  const importRun = await resolveImportRun();
  const { assessmentId, versionId, paperJob, markschemeJob } = importRun;
  const paperJobId = paperJob.id;
  const markschemeJobId = markschemeJob.id;
  await ensurePaperSourcePages(assessmentId, versionId, 20);
  const paperResult = await completeMineruJob(paperJob, "question paper");
  const markschemeResult = await completeMineruJob(markschemeJob, "markscheme");
  const mineruPaperText = await downloadArtifactText(paperResult.result_object_path);
  const mineruEvaluation = evaluateExtractedPaperText(mineruPaperText, expected);

  let suggestion = await loadLatestSuggestion(versionId);
  let deepseekFailure = await loadPriorDeepseekFailure(versionId);
  if (!suggestion && !deepseekFailure) {
    try {
      await invokeEdge("ai-parse-assessment", {
        assessment_version_id: versionId,
        source_kind: "mineru",
        owner_notes: [
          "Ground truth: 12 questions and 110 marks.",
          "Section A is Q1-Q9. Section B is Q10-Q12.",
          "Q1(c) requires a graph sketch on a grid; Q4 has roof cross-section diagrams; Q7 has a seating-row diagram; Q10 has a population table; Q12(f) requires a curve sketch with asymptotes.",
          "Do not publish. Return review-required suggestions only.",
        ].join(" "),
      });
      suggestion = await loadLatestSuggestion(versionId);
    } catch (error) {
      deepseekFailure = classifyProviderFailure(error);
    }
  }

  const packageValue = suggestion?.normalized_package_json ?? null;
  const evaluation = packageValue ? evaluatePaperPackage(packageValue, expected) : mineruEvaluation;
  const sourceRegionCount = packageValue ? countSourceRegions(packageValue) : 0;
  const answerTypesComplete = packageValue ? allRootQuestionsHaveResponseModes(packageValue) : false;
  const paperChecks = ["source_pages", "manual_fallback"];
  if (evaluation.actualQuestionCount > 0) paperChecks.push("question_text");
  if (evaluation.marksMatch) paperChecks.push("marks");
  if (sourceRegionCount > 0) paperChecks.push("question_regions");
  if (answerTypesComplete) paperChecks.push("answer_types");

  const markschemeCoverage = packageValue ? countMappedMarkschemeQuestions(packageValue) : 0;
  let handwriting = { resultId: null, hasText: false, failure: null };
  try {
    handwriting = { ...(await runSimpleTexHandwritingQa(assessmentId, versionId)), failure: null };
  } catch (error) {
    console.warn(`SimpleTeX live QA failed: ${error instanceof Error ? error.message : "provider request failed"}`);
    handwriting = { resultId: null, hasText: false, failure: classifyProviderFailure(error) };
  }
  const paperPassed = evaluation.passed && sourceRegionCount > 0 && answerTypesComplete && handwriting.hasText;
  const markschemePassed = markschemeCoverage >= 12;

  await upsertQaResult({
    fixtureId: "sample-pdf-regions",
    status: paperPassed ? "passed" : "needs_review",
    provider: suggestion ? "mineru_hosted + deepseek + simpletex" : "mineru_hosted + simpletex (DeepSeek unavailable)",
    checks: paperChecks,
    confidence: numberOrNull(suggestion?.confidence),
    expected: { ...expected, subject: "IB Mathematics: Analysis and Approaches, Higher Level, Paper 2" },
    actual: {
      ...evaluation,
      sourceRegionCount,
      answerTypesComplete,
      handwritingTextDetected: handwriting.hasText,
      deepseekFailure,
      simpletexFailure: handwriting.failure,
    },
    evidence: {
      assessment_id: assessmentId,
      assessment_version_id: versionId,
      parse_job_id: paperJobId,
      mineru_result_object_path: paperResult.result_object_path ?? null,
      simpletex_result_id: handwriting.resultId,
      paper_sha256: fileHashIfPresent(paperPath),
      handwriting_sha256: fileHash(handwritingPath),
    },
    errorMessage: paperPassed ? null : `Provider output remains review-required. DeepSeek: ${deepseekFailure ?? "available"}; SimpleTeX: ${handwriting.failure ?? "completed"}. Missing automatic region or answer-type evidence is not treated as success.`,
  });

  await upsertQaResult({
    fixtureId: "sample-markscheme-rubrics",
    status: markschemePassed ? "passed" : "needs_review",
    provider: suggestion ? "mineru_hosted + deepseek" : "mineru_hosted (DeepSeek unavailable)",
    checks: markschemePassed ? ["rubric_mapping", "marks", "manual_fallback"] : ["marks", "manual_fallback"],
    confidence: numberOrNull(suggestion?.confidence),
    expected: { mappedQuestionCount: 12, totalMarks: 110 },
    actual: { mappedQuestionCount: markschemeCoverage, deepseekFailure },
    evidence: {
      assessment_id: assessmentId,
      assessment_version_id: versionId,
      parse_job_id: markschemeJobId,
      mineru_result_object_path: markschemeResult.result_object_path ?? null,
      markscheme_sha256: fileHashIfPresent(markschemePath),
    },
    errorMessage: markschemePassed ? null : "Automatic markscheme mapping needs owner review; no rubric or mark allocation was auto-applied.",
  });

  console.log("Live Smart Import QA completed without publishing the assessment.");
  console.log(`Assessment: ${assessmentId}`);
  console.log(`Version: ${versionId}`);
  console.log(`Questions: ${evaluation.actualQuestionCount}/12`);
  console.log(`Marks: ${evaluation.actualTotalMarks}/110`);
  console.log(`Question regions: ${sourceRegionCount}`);
  console.log(`Markscheme mappings: ${markschemeCoverage}/12`);
  console.log(`SimpleTeX handwriting text detected: ${handwriting.hasText ? "yes" : "no"}`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
  await ownerClient.auth.signOut({ scope: "local" });
}

async function establishOwnerAal2() {
  const { error: signInError } = await ownerClient.auth.signInWithPassword({ email: ownerAccount.email, password: ownerAccount.password });
  if (signInError) throw signInError;
  const code = totpCode(ownerAccount.totp_secret);
  const { error: mfaError } = await ownerClient.auth.mfa.challengeAndVerify({ factorId: ownerAccount.totp_factor_id, code });
  if (mfaError) throw mfaError;
  const { data: assurance, error: assuranceError } = await ownerClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) throw assuranceError;
  if (assurance.currentLevel !== "aal2") throw new Error("Synthetic QA owner did not reach AAL2");
}

async function invokeEdge(name, body) {
  const { data, error } = await ownerClient.functions.invoke(name, { body });
  if (error) {
    let detail = error.message;
    try {
      const payload = await error.context?.json();
      if (payload?.error) detail = payload.error;
    } catch { /* keep transport message */ }
    throw new Error(`${name}: ${detail}`);
  }
  if (data?.error) throw new Error(`${name}: ${data.error}`);
  return data;
}

async function resolveImportRun() {
  const { data: assessment, error: assessmentError } = await admin
    .from("assessments")
    .select("id")
    .eq("owner_profile_id", credentials.qa_owner_profile_id)
    .eq("title", "QA - IB Mathematics AA HL Paper 2")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (assessmentError) throw assessmentError;

  if (assessment) {
    const { data: version, error: versionError } = await admin
      .from("assessment_versions")
      .select("id")
      .eq("assessment_id", assessment.id)
      .order("version_no", { ascending: false })
      .limit(1)
      .single();
    if (versionError) throw versionError;
    const { data: jobs, error: jobsError } = await admin
      .from("parse_jobs")
      .select("id,status,result_object_path,error_message,metadata_json")
      .eq("assessment_version_id", version.id)
      .in("parser", ["mineru", "mineru_hosted"])
      .order("created_at", { ascending: true });
    if (jobsError) throw jobsError;
    const paperJob = (jobs ?? []).find((job) => job.metadata_json?.parse_purpose !== "markscheme");
    const markschemeJob = (jobs ?? []).find((job) => job.metadata_json?.parse_purpose === "markscheme");
    if (paperJob && markschemeJob) {
      console.log("Reusing completed synthetic QA import when provider artifacts already exist.");
      return { assessmentId: assessment.id, versionId: version.id, paperJob, markschemeJob };
    }
  }

  if (!existsSync(paperPath) || !existsSync(markschemePath)) {
    throw new Error("Paper and markscheme inputs are required when no reusable synthetic QA import exists");
  }

  const ingest = await invokeEdge("ingest-assessment", {
    title: "QA - IB Mathematics AA HL Paper 2",
    paper_code: `QA-AAHL-P2-${new Date().toISOString().slice(0, 10)}`,
    subject: "IB Mathematics: Analysis and Approaches, Higher Level, Paper 2",
    assessment_kind: "exam",
    source_kind: "pdf",
    pdf_source_base64: readFileSync(paperPath).toString("base64"),
    pdf_source_filename: basename(paperPath),
    pdf_source_content_type: "application/pdf",
    markscheme_source_kind: "pdf",
    markscheme_pdf_base64: readFileSync(markschemePath).toString("base64"),
    markscheme_pdf_filename: basename(markschemePath),
    markscheme_pdf_content_type: "application/pdf",
  });
  const assessmentId = String(ingest.assessment_id ?? "");
  const versionId = String(ingest.draft_version_id ?? "");
  const paperJobId = String(ingest.parse_job_id ?? "");
  const markschemeJobId = String(ingest.markscheme_parse_job_id ?? "");
  if (!assessmentId || !versionId || !paperJobId || !markschemeJobId) throw new Error("Ingest did not return both parse jobs");
  await annotateParseJob(paperJobId, 20, "paper");
  await annotateParseJob(markschemeJobId, 30, "markscheme");
  return {
    assessmentId,
    versionId,
    paperJob: { id: paperJobId, status: "queued", result_object_path: null, metadata_json: { parse_purpose: "paper" } },
    markschemeJob: { id: markschemeJobId, status: "queued", result_object_path: null, metadata_json: { parse_purpose: "markscheme" } },
  };
}

async function completeMineruJob(job, label) {
  if (job.status === "review_required" && job.result_object_path) return job;
  if (job.status === "queued") await invokeEdge("mineru-submit-hosted-job", { parse_job_id: job.id });
  if (job.status === "failed") await invokeEdge("mineru-submit-hosted-job", { parse_job_id: job.id, force: true });
  return await pollMineru(job.id, label);
}

async function loadLatestSuggestion(versionId) {
  const { data, error } = await admin
    .from("ai_parse_suggestions")
    .select("id,normalized_package_json,confidence,warnings_json,status,created_at")
    .eq("assessment_version_id", versionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadPriorDeepseekFailure(versionId) {
  const { data, error } = await admin
    .from("parse_jobs")
    .select("error_message")
    .eq("assessment_version_id", versionId)
    .eq("parser", "deepseek_ai")
    .eq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.error_message ? classifyProviderFailure(new Error(data.error_message)) : null;
}

async function downloadArtifactText(objectPath) {
  if (!objectPath) throw new Error("MinerU did not produce a readable primary artifact");
  const { data, error } = await admin.storage.from("assessment-packages").download(objectPath);
  if (error || !data) throw error ?? new Error("MinerU artifact could not be downloaded");
  return await data.text();
}

async function pollMineru(parseJobId, label) {
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    const result = await invokeEdge("mineru-poll-hosted-job", { parse_job_id: parseJobId });
    if (result.status === "review_required") return result;
    if (result.status === "failed") throw new Error(`MinerU ${label} extraction failed: ${result.error_message ?? "unknown error"}`);
    console.log(`MinerU ${label}: ${result.external_state ?? result.status ?? "processing"} (${attempt}/40)`);
    await sleep(15_000);
  }
  throw new Error(`MinerU ${label} extraction did not complete within 10 minutes`);
}

async function annotateParseJob(parseJobId, pageCount, purpose) {
  const { data: row, error: readError } = await admin.from("parse_jobs").select("metadata_json").eq("id", parseJobId).single();
  if (readError) throw readError;
  const { error } = await admin.from("parse_jobs").update({
    metadata_json: {
      ...(row.metadata_json ?? {}),
      page_count: pageCount,
      pages_processed: 0,
      parse_purpose: purpose,
      owner_quota_pages: 200,
      qa_fixture_id: purpose === "paper" ? "sample-pdf-regions" : "sample-markscheme-rubrics",
    },
  }).eq("id", parseJobId);
  if (error) throw error;
}

async function ensurePaperSourcePages(assessmentId, versionId, pageCount) {
  const { data: version, error: versionError } = await admin.from("assessment_versions").select("source_object_path").eq("id", versionId).single();
  if (versionError) throw versionError;
  let { data: document, error: documentError } = await admin.from("source_documents")
    .select("id")
    .eq("assessment_version_id", versionId)
    .eq("object_path", version.source_object_path)
    .maybeSingle();
  if (documentError) throw documentError;
  if (!document) {
    const inserted = await admin.from("source_documents").insert({
      owner_profile_id: credentials.qa_owner_profile_id,
      assessment_id: assessmentId,
      assessment_version_id: versionId,
      document_kind: "question_paper",
      source_kind: "pdf",
      object_path: version.source_object_path,
      original_file_name: basename(paperPath),
      status: "review_required",
      metadata_json: { page_count: pageCount, qa_fixture: true },
    }).select("id").single();
    if (inserted.error) throw inserted.error;
    document = inserted.data;
  }
  const { error: pagesError } = await admin.from("source_pages").upsert(
    Array.from({ length: pageCount }, (_, index) => ({
      source_document_id: document.id,
      page_number: index + 1,
      width_points: 595.276,
      height_points: 841.89,
      metadata_json: { qa_fixture: true, client_pdf_rendering: true },
    })),
    { onConflict: "source_document_id,page_number" },
  );
  if (pagesError) throw pagesError;
}

async function runSimpleTexHandwritingQa(assessmentId, versionId) {
  const prefix = join(temporaryDirectory, "handwriting-page");
  execFileSync("pdftoppm", ["-f", "1", "-l", "1", "-png", "-singlefile", "-r", "160", handwritingPath, prefix]);
  const imagePath = `${prefix}.png`;
  const sourceObjectPath = `${credentials.qa_owner_profile_id}/qa/${versionId}/handwriting-sample.pdf`;
  const imageObjectPath = `${credentials.qa_owner_profile_id}/qa/${versionId}/handwriting-sample.png`;
  for (const [bucket, objectPath, filePath, contentType] of [
    ["assessment-sources", sourceObjectPath, handwritingPath, "application/pdf"],
    ["assessment-packages", imageObjectPath, imagePath, "image/png"],
  ]) {
    const { error } = await admin.storage.from(bucket).upload(objectPath, readFileSync(filePath), { contentType, upsert: true });
    if (error) throw error;
  }
  let { data: sourceDocument, error: documentError } = await admin.from("source_documents")
    .select("id")
    .eq("assessment_version_id", versionId)
    .eq("object_path", sourceObjectPath)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (documentError) throw documentError;
  if (!sourceDocument) {
    const inserted = await admin.from("source_documents").insert({
      owner_profile_id: credentials.qa_owner_profile_id,
      assessment_id: assessmentId,
      assessment_version_id: versionId,
      document_kind: "other",
      source_kind: "pdf",
      object_path: sourceObjectPath,
      original_file_name: basename(handwritingPath),
      status: "review_required",
      metadata_json: { qa_fixture: true, purpose: "handwriting_ocr" },
    }).select("id").single();
    if (inserted.error) throw inserted.error;
    sourceDocument = inserted.data;
  }
  const { data: page, error: pageError } = await admin.from("source_pages").upsert({
    source_document_id: sourceDocument.id,
    page_number: 1,
    width_points: 612,
    height_points: 792,
    image_object_path: imageObjectPath,
    metadata_json: { qa_fixture: true, purpose: "handwriting_ocr" },
  }, { onConflict: "source_document_id,page_number" }).select("id").single();
  if (pageError) throw pageError;
  const { data: existingResult, error: existingResultError } = await admin.from("ocr_provider_results")
    .select("id,extracted_text,extracted_latex")
    .eq("source_page_id", page.id)
    .eq("provider", "simpletex")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingResultError) throw existingResultError;
  const hasExistingText = Boolean(
    String(existingResult?.extracted_text ?? "").trim() || String(existingResult?.extracted_latex ?? "").trim(),
  );
  if (existingResult && hasExistingText) {
    return {
      resultId: existingResult.id,
      hasText: true,
    };
  }
  const result = await invokeEdge("simpletex-ocr-source-page", { source_page_id: page.id, mode: "general" });
  const extractedText = String(result.result?.extracted_text ?? "").trim();
  const extractedLatex = String(result.result?.extracted_latex ?? "").trim();
  return { resultId: result.result?.id ?? null, hasText: Boolean(extractedText || extractedLatex) };
}

async function upsertQaResult({ fixtureId, status, provider, checks, confidence, expected: expectedValue, actual, evidence, errorMessage }) {
  const { error } = await admin.from("smart_import_qa_results").upsert({
    owner_profile_id: credentials.qa_owner_profile_id,
    fixture_id: fixtureId,
    status,
    provider,
    checks_json: checks,
    confidence,
    expected_json: expectedValue,
    actual_json: actual,
    evidence_json: evidence,
    error_message: errorMessage,
    reviewed_by_profile_id: credentials.qa_owner_profile_id,
    reviewed_at: new Date().toISOString(),
  }, { onConflict: "owner_profile_id,fixture_id" });
  if (error) throw error;
}

function countSourceRegions(packageValue) {
  const roots = packageValue?.questions ?? packageValue?.normalized_package?.questions ?? [];
  return flatten(roots).filter((node) => node?.source_region_json && Object.keys(node.source_region_json).length > 0).length;
}

function allRootQuestionsHaveResponseModes(packageValue) {
  const roots = packageValue?.questions ?? packageValue?.normalized_package?.questions ?? [];
  return Array.isArray(roots) && roots.length === 12 && roots.every((node) => typeof node?.response_mode === "string" && node.response_mode.length > 0);
}

function countMappedMarkschemeQuestions(packageValue) {
  const roots = packageValue?.questions ?? packageValue?.normalized_package?.questions ?? [];
  return Array.isArray(roots) ? roots.filter((root) => flatten([root]).some((node) => String(node?.markscheme_html ?? "").trim())).length : 0;
}

function flatten(nodes) {
  return Array.isArray(nodes) ? nodes.flatMap((node) => [node, ...flatten(node?.children)]) : [];
}

function fileHash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fileHashIfPresent(path) {
  return existsSync(path) ? fileHash(path) : null;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function totpCode(base32Secret, timestamp = Date.now()) {
  const key = decodeBase32(base32Secret);
  const counter = Math.floor(timestamp / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(value % 1_000_000).padStart(6, "0");
}

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = String(value).toUpperCase().replace(/=+$/g, "").replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const character of normalized) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}
