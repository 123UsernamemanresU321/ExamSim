import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";

const ROOT = process.cwd();
const FIXTURE_PATH = resolve(ROOT, "scripts/fixtures/ib-dp-guide-structures.json");
const MAX_PDF_BYTES = 50 * 1024 * 1024;
const dryRun = process.argv.includes("--dry-run");

loadEnvFile(resolve(ROOT, ".env.local"));

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
const validatedResources = await Promise.all(fixture.resources.map(validatePdfEntry));
const validatedFrameworks = await Promise.all(fixture.frameworks.map(validatePdfEntry));

if (dryRun) {
  printValidationSummary(validatedResources, validatedFrameworks);
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
if (!url || !serviceRoleKey || !ownerEmail) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and OWNER_EMAIL are required");
}

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: privateImportFetch },
});

const { ownerAuthUserId, ownerProfileId } = await resolveOwner(ownerEmail);
const importedResources = [];
const importedFrameworks = [];

for (const entry of validatedResources) {
  console.log(`Importing private resource: ${entry.title}`);
  importedResources.push(await importResource(entry));
}
for (const entry of validatedFrameworks) {
  console.log(`Importing private curriculum source: ${entry.name}`);
  importedFrameworks.push(await importFramework(entry));
}

await admin.from("owner_audit_logs").insert({
  owner_profile_id: ownerProfileId,
  actor_auth_user_id: ownerAuthUserId,
  action: "ib_private_content.imported",
  target_table: "curriculum_source_documents",
  metadata_json: {
    resources: importedResources.map((item) => item.id),
    frameworks: importedFrameworks.map((item) => item.id),
    source: "school-authorized-private-pdfs",
  },
});

console.log(JSON.stringify({
  ok: true,
  owner_profile_id: ownerProfileId,
  resources: importedResources.length,
  frameworks: importedFrameworks.length,
  review_state: "draft",
}, null, 2));

async function importResource(entry) {
  const objectPath = `${ownerProfileId}/${entry.sha256}/${entry.key}.pdf`;
  await ensurePrivateObject("assessment-resources", objectPath, entry.bytes);

  const { data, error } = await admin.from("resource_library_items").upsert({
    owner_profile_id: ownerProfileId,
    title: entry.title,
    material_type: entry.type,
    subject: entry.subject,
    level: entry.level,
    version_label: entry.version,
    language_code: entry.language,
    object_path: objectPath,
    sha256: entry.sha256,
    file_size_bytes: entry.fileSize,
    page_count: entry.actualPageCount,
    content_type: "application/pdf",
    status: "active",
    created_by_profile_id: ownerProfileId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "owner_profile_id,sha256" }).select("id,title,object_path").single();
  if (error) throw error;
  return data;
}

async function importFramework(entry) {
  const objectPath = `${ownerProfileId}/${entry.sha256}/${slug(entry.code)}.pdf`;
  await ensurePrivateObject("curriculum-sources", objectPath, entry.bytes);

  let source = await findOne("curriculum_source_documents", "sha256", entry.sha256);
  if (!source) {
    const { data, error } = await admin.from("curriculum_source_documents").insert({
      owner_profile_id: ownerProfileId,
      title: entry.name,
      subject: entry.subject,
      programme_component: entry.component,
      version_label: entry.version,
      language_code: "en",
      object_path: objectPath,
      sha256: entry.sha256,
      file_size_bytes: entry.fileSize,
      page_count: entry.actualPageCount,
      status: "needs_review",
      created_by_profile_id: ownerProfileId,
    }).select("id,status").single();
    if (error) throw error;
    source = data;
  }

  let framework = await findFramework(entry.code, entry.version);
  if (!framework) {
    const { data, error } = await admin.from("curriculum_frameworks").insert({
      owner_profile_id: ownerProfileId,
      code: entry.code,
      name: entry.name,
      version: entry.version,
      description: "School-reviewed, guide-version-specific draft. Approve concise nodes before they affect authoring, analytics, or revision.",
      review_status: entry.reviewStatus,
      source_document_id: source.id,
      created_by_profile_id: ownerProfileId,
    }).select("id,review_status").single();
    if (error) throw error;
    framework = data;
  } else {
    const { error } = await admin.from("curriculum_frameworks").update({
      name: entry.name,
      source_document_id: source.id,
      updated_at: new Date().toISOString(),
    }).eq("id", framework.id).eq("owner_profile_id", ownerProfileId);
    if (error) throw error;
  }

  const { error: sourceFrameworkError } = await admin.from("curriculum_source_documents").update({
    framework_id: framework.id,
    title: entry.name,
    subject: entry.subject,
    programme_component: entry.component,
    version_label: entry.version,
    object_path: objectPath,
    updated_at: new Date().toISOString(),
  }).eq("id", source.id).eq("owner_profile_id", ownerProfileId);
  if (sourceFrameworkError) throw sourceFrameworkError;

  const { data: existingRows, error: existingError } = await admin.from("curriculum_standards")
    .select("id,code,review_status")
    .eq("framework_id", framework.id)
    .eq("owner_profile_id", ownerProfileId);
  if (existingError) throw existingError;
  const standardByCode = new Map((existingRows ?? []).map((row) => [row.code, row]));

  for (const [sortOrder, node] of entry.nodes.entries()) {
    const parent = node.parentCode ? standardByCode.get(node.parentCode) : null;
    if (node.parentCode && !parent) throw new Error(`${entry.code}: parent ${node.parentCode} must appear before ${node.code}`);
    const values = {
      owner_profile_id: ownerProfileId,
      framework_id: framework.id,
      parent_standard_id: parent?.id ?? null,
      code: node.code,
      title: node.title,
      description: node.description ?? null,
      subject: entry.subject,
      level: entry.level,
      sort_order: sortOrder,
      metadata_json: { school_review_required: true, source_version: entry.version },
      standard_kind: node.kind,
      source_document_id: source.id,
      source_page_start: node.sourcePageStart,
      source_page_end: node.sourcePageEnd ?? node.sourcePageStart,
      updated_at: new Date().toISOString(),
    };
    const existing = standardByCode.get(node.code);
    if (existing) {
      const { data, error } = await admin.from("curriculum_standards").update(values)
        .eq("id", existing.id)
        .eq("owner_profile_id", ownerProfileId)
        .select("id,code,review_status")
        .single();
      if (error) throw error;
      standardByCode.set(node.code, data);
    } else {
      const { data, error } = await admin.from("curriculum_standards").insert({
        ...values,
        review_status: "draft",
      }).select("id,code,review_status").single();
      if (error) throw error;
      standardByCode.set(node.code, data);
    }
  }

  const { error: jobError } = await admin.from("curriculum_import_jobs").insert({
    owner_profile_id: ownerProfileId,
    source_document_id: source.id,
    provider: "deterministic_school_fixture",
    status: "needs_review",
    progress_percent: 100,
    retry_count: 0,
    result_summary_json: {
      framework_id: framework.id,
      node_count: entry.nodes.length,
      approved_count: [...standardByCode.values()].filter((node) => node.review_status === "approved").length,
    },
    created_by_profile_id: ownerProfileId,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });
  if (jobError) throw jobError;

  return framework;
}

async function validatePdfEntry(entry) {
  const path = resolve(entry.sourceFile);
  if (!existsSync(path)) throw new Error(`Missing authorized private PDF: ${path}`);
  const bytes = readFileSync(path);
  if (bytes.length === 0 || bytes.length > MAX_PDF_BYTES) throw new Error(`${basename(path)} must be between 1 byte and 50 MB`);
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error(`${basename(path)} does not have PDF magic bytes`);
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const actualPageCount = document.getPageCount();
  if (actualPageCount !== entry.pageCount) throw new Error(`${basename(path)} expected ${entry.pageCount} pages but has ${actualPageCount}`);
  return {
    ...entry,
    sourceFile: path,
    bytes,
    fileSize: bytes.length,
    actualPageCount,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function resolveOwner(email) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
  if (!user) throw new Error(`OWNER_EMAIL does not match a Supabase Auth user: ${email}`);
  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("id,app_role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile || profile.app_role !== "owner") throw new Error("OWNER_EMAIL must resolve to an owner profile");
  return { ownerAuthUserId: user.id, ownerProfileId: profile.id };
}

async function ensurePrivateObject(bucket, path, bytes) {
  const { error } = await admin.storage.from(bucket).upload(path, bytes, {
    contentType: "application/pdf",
    cacheControl: "3600",
    upsert: false,
  });
  if (error && !/duplicate|already exists|resource already exists/i.test(error.message)) throw error;
}

async function findOne(table, column, value) {
  const { data, error } = await admin.from(table).select("*")
    .eq("owner_profile_id", ownerProfileId)
    .eq(column, value)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findFramework(code, version) {
  const { data, error } = await admin.from("curriculum_frameworks").select("id,review_status")
    .eq("owner_profile_id", ownerProfileId)
    .eq("code", code)
    .eq("version", version)
    .maybeSingle();
  if (error) throw error;
  return data;
}

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

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function printValidationSummary(resources, frameworks) {
  console.log(JSON.stringify({
    ok: true,
    mode: "dry-run",
    resources: resources.map(summary),
    frameworks: frameworks.map((item) => ({ ...summary(item), nodes: item.nodes.length })),
  }, null, 2));
}

function summary(item) {
  return {
    key: item.key ?? item.code,
    file: basename(item.sourceFile),
    bytes: item.fileSize,
    pages: item.actualPageCount,
    sha256: item.sha256,
  };
}

function privateImportFetch(input, init) {
  const timeoutSignal = AbortSignal.timeout(180_000);
  const requestSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const signal = requestSignal ? AbortSignal.any([requestSignal, timeoutSignal]) : timeoutSignal;
  return fetch(input, { ...init, signal });
}
