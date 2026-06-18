export type V3ProviderCapabilityKey =
  | "ocr_layout"
  | "ai_semantic"
  | "latex_compiler"
  | "pdf_rendering"
  | "storage_private_files"
  | "edge_functions"
  | "email_notifications"
  | "export_pipeline";

export type V3ProviderStatus = "ready" | "provider_required" | "manual_fallback" | "staging_required" | "blocked";

export type V3ImportJobState =
  | "not_configured"
  | "queued"
  | "processing"
  | "failed"
  | "low_confidence"
  | "needs_review"
  | "completed"
  | "retried";

export type ProviderReadinessEnv = Partial<Record<string, string | undefined>>;

export type V3ProviderReadinessItem = {
  key: V3ProviderCapabilityKey;
  title: string;
  status: V3ProviderStatus;
  ownerMessage: string;
  requiredEnvVars: string[];
  fallback: string;
  safeProbe: string;
  setupReference: string;
};

export type ImportJobLike = {
  id?: string | null;
  parser?: string | null;
  status?: string | null;
  requested_ocr?: boolean | null;
  source_object_path?: string | null;
  external_provider?: string | null;
  external_state?: string | null;
  metadata_json?: unknown;
  error_message?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ImportAuditLike = {
  action?: string | null;
  target_table?: string | null;
  target_id?: string | null;
  created_at?: string | null;
  metadata_json?: unknown;
};

export type ImportCostPolicy = {
  pageWarnThreshold?: number;
  costWarnThresholdUsd?: number;
  ownerLimitUsd?: number;
  env?: ProviderReadinessEnv;
};

export type ImportCostGuard = {
  pageCount: number | null;
  pagesProcessed: number | null;
  retryCount: number;
  provider: string;
  sourceLabel: string;
  estimatedCostUsd: number | null;
  ownerQuotaUsd: number | null;
  requiresConfirmation: boolean;
  reasons: Array<"large_page_count" | "cost_threshold" | "owner_quota" | "provider_missing">;
};

export type SmartImportSampleKind = "pdf" | "latex" | "markscheme";

export type SmartImportSampleCheck =
  | "source_pages"
  | "question_regions"
  | "question_text"
  | "marks"
  | "answer_types"
  | "rubric_mapping"
  | "manual_fallback";

export type SmartImportSampleQaStatus =
  | "passed"
  | "failed"
  | "needs_review"
  | "provider_required"
  | "not_run";

export type SmartImportSampleFixture = {
  id: string;
  title: string;
  kind: SmartImportSampleKind;
  sourceLabel: string;
  requiredProviders: Array<"mineru" | "deepseek" | "latex">;
  expectedChecks: SmartImportSampleCheck[];
};

export type SmartImportSampleQaResult = {
  fixture_id?: string | null;
  status?: SmartImportSampleQaStatus | string | null;
  provider?: string | null;
  checks?: string[] | null;
  confidence?: number | null;
  reviewed_at?: string | null;
  error_message?: string | null;
};

export type SmartImportSampleQaItem = {
  fixture: SmartImportSampleFixture;
  status: SmartImportSampleQaStatus;
  provider: string;
  confidence: number | null;
  reviewedAt: string | null;
  missingChecks: SmartImportSampleCheck[];
  ownerMessage: string;
};

export type BatchImportFileLike = {
  name: string;
  sizeBytes: number;
  contentType?: string | null;
};

export type BatchPdfImportIssueCode =
  | "duplicate_file_name"
  | "file_too_large"
  | "unsupported_file_type"
  | "ocr_provider_missing"
  | "large_batch_confirmation";

export type BatchPdfImportPlan = {
  totalFiles: number;
  acceptedPdfCount: number;
  rejectedFileCount: number;
  duplicateNames: string[];
  estimatedPages: number;
  issueCodes: BatchPdfImportIssueCode[];
  requiresOwnerConfirmation: boolean;
  canSubmitToProvider: boolean;
  manualFallbackAvailable: boolean;
  grouping: {
    sourcePdfNames: string[];
    markschemeNames: string[];
  };
};

export const V3_PROVIDER_CAPABILITY_KEYS = [
  "ocr_layout",
  "ai_semantic",
  "latex_compiler",
  "pdf_rendering",
  "storage_private_files",
  "edge_functions",
  "email_notifications",
  "export_pipeline",
] as const satisfies readonly V3ProviderCapabilityKey[];

export const V3_IMPORT_JOB_STATES = [
  "not_configured",
  "queued",
  "processing",
  "failed",
  "low_confidence",
  "needs_review",
  "completed",
  "retried",
] as const satisfies readonly V3ImportJobState[];

export const V3_IMPORT_JOB_LABELS: Record<V3ImportJobState, string> = {
  not_configured: "Not configured",
  queued: "Queued",
  processing: "Processing",
  failed: "Failed",
  low_confidence: "Low confidence",
  needs_review: "Needs review",
  completed: "Completed",
  retried: "Retried",
};

export const SMART_IMPORT_SAMPLE_QA_FIXTURES = [
  {
    id: "sample-pdf-regions",
    title: "PDF source regions",
    kind: "pdf",
    sourceLabel: "Sample question paper PDF",
    requiredProviders: ["mineru"],
    expectedChecks: ["source_pages", "question_regions", "question_text", "marks", "answer_types", "manual_fallback"],
  },
  {
    id: "sample-latex-structure",
    title: "LaTeX structure import",
    kind: "latex",
    sourceLabel: "Sample Examsim LaTeX source",
    requiredProviders: ["latex"],
    expectedChecks: ["question_text", "marks", "answer_types", "manual_fallback"],
  },
  {
    id: "sample-markscheme-rubrics",
    title: "Markscheme to rubrics",
    kind: "markscheme",
    sourceLabel: "Sample markscheme PDF/text",
    requiredProviders: ["deepseek"],
    expectedChecks: ["rubric_mapping", "marks", "manual_fallback"],
  },
] as const satisfies readonly SmartImportSampleFixture[];

export function getProviderReadiness(env: ProviderReadinessEnv = process.env): V3ProviderReadinessItem[] {
  const hasDeepSeek = hasEnv(env, "DEEPSEEK_API_KEY");
  const hasMineru = hasEnv(env, "MINERU_API_KEY") || hasEnv(env, "MINERU_WORKER_HMAC_SECRET");
  const hasSupabase = hasEnv(env, "NEXT_PUBLIC_SUPABASE_URL") && hasEnv(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const hasMail = hasEnv(env, "RESEND_API_KEY") || hasEnv(env, "POSTMARK_SERVER_TOKEN") || hasEnv(env, "SENDGRID_API_KEY");

  return [
    {
      key: "ocr_layout",
      title: "OCR and layout extraction",
      status: hasMineru ? "ready" : "provider_required",
      ownerMessage: hasMineru
        ? "MinerU/OCR credentials are present. Layout extraction can be submitted through server-side Edge Functions and still requires teacher review."
        : "Provider-backed OCR is not configured. Teachers should use the manual PDF region editor instead of expecting automatic detection.",
      requiredEnvVars: ["MINERU_API_KEY or MINERU_WORKER_HMAC_SECRET"],
      fallback: "Manual PDF upload, page review, normalized region drawing, and source-anchor linking.",
      safeProbe: "Configuration-only check; no PDF is sent to an external provider from this dashboard.",
      setupReference: "Set MinerU hosted credentials or a signed worker secret in Supabase Edge secrets.",
    },
    {
      key: "ai_semantic",
      title: "AI parsing and semantic grouping",
      status: hasDeepSeek ? "ready" : "manual_fallback",
      ownerMessage: hasDeepSeek
        ? "DeepSeek credentials are present for review-required parser suggestions and semantic grouping assists."
        : "Semantic grouping and AI parser suggestions are unavailable. Deterministic repair and manual grouping remain supported.",
      requiredEnvVars: ["DEEPSEEK_API_KEY"],
      fallback: "Deterministic parser repair, answer normalization, numeric grouping, and teacher-reviewed manual groups.",
      safeProbe: "Configuration-only check; no prompts or student data are sent from this dashboard.",
      setupReference: "Set DEEPSEEK_API_KEY server-side only and keep AI suggestions review-required.",
    },
    {
      key: "latex_compiler",
      title: "LaTeX compiler workspace",
      status: "ready",
      ownerMessage: "The deterministic Examsim LaTeX syntax parser is available without an external provider; rendered PDF compilation remains environment-dependent.",
      requiredEnvVars: [],
      fallback: "Split editor, parse warnings, manual question-card correction, and Advanced JSON Review for power users.",
      safeProbe: "Local syntax support check only; production PDF compilation should be verified in staging.",
      setupReference: "Use Examsim syntax and run staging checks with the configured build/runtime image.",
    },
    {
      key: "pdf_rendering",
      title: "PDF rendering and source regions",
      status: "ready",
      ownerMessage: "Private PDF sources, source pages, and manual normalized region editing are available without relying on OCR.",
      requiredEnvVars: [],
      fallback: "Client-side visual review and manual region linking when thumbnails or OCR-derived page metadata are unavailable.",
      safeProbe: "Feature-path check only; private PDFs still require signed URLs through server/Edge code.",
      setupReference: "Keep source PDFs in private Supabase Storage buckets and use owner signing routes.",
    },
    {
      key: "storage_private_files",
      title: "Private storage and signed files",
      status: hasSupabase ? "ready" : "provider_required",
      ownerMessage: hasSupabase
        ? "Supabase client configuration is present. Private bucket access must still be validated in staging."
        : "Supabase URL/anon configuration is missing, so private storage and signed-file flows cannot run in this environment.",
      requiredEnvVars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
      fallback: "Block high-stakes exam delivery until private bucket signing is verified.",
      safeProbe: "Configuration-only check; no bucket policy is modified.",
      setupReference: "Confirm assessment-packages, answer-uploads, and marking-packets buckets are private.",
    },
    {
      key: "edge_functions",
      title: "Edge function security boundary",
      status: hasSupabase ? "staging_required" : "provider_required",
      ownerMessage: hasSupabase
        ? "Edge Function configuration is present, but deploy-time checks and signed workflow tests must pass before launch."
        : "Supabase configuration is missing, so Edge-mediated guest tokens, uploads, parsing, and finalization cannot be validated.",
      requiredEnvVars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "ATTEMPT_STATE_TOKEN_SECRET"],
      fallback: "Do not run guest exam delivery until Edge Functions are deployed and staging-tested.",
      safeProbe: "Configuration-only check; sensitive Edge workflows are not called from the dashboard.",
      setupReference: "Deploy Edge Functions and run the synthetic guest/authenticated QA workflow.",
    },
    {
      key: "email_notifications",
      title: "Email and notification provider",
      status: hasMail ? "staging_required" : "manual_fallback",
      ownerMessage: hasMail
        ? "A mail provider key appears configured; low-volume staging sends and suppression handling still need validation."
        : "No mail provider is configured. Owners can still copy exam instructions and student numbers manually.",
      requiredEnvVars: ["Optional RESEND_API_KEY, POSTMARK_SERVER_TOKEN, or SENDGRID_API_KEY"],
      fallback: "Copyable instruction blocks, in-app notifications, and manual distribution packs.",
      safeProbe: "Configuration-only check; no email is sent.",
      setupReference: "Configure provider spending/sending limits and verified domains before production emails.",
    },
    {
      key: "export_pipeline",
      title: "Exports and reports",
      status: "staging_required",
      ownerMessage: "JSON, CSV, and PDF-style report surfaces exist, but every export type should be verified with representative marked attempts before launch.",
      requiredEnvVars: [],
      fallback: "Use CSV/JSON exports with fidelity warnings for unsupported Moodle/QTI features.",
      safeProbe: "Feature inventory check only; no report is generated by this dashboard.",
      setupReference: "Validate markbook, student report, QTI, and Moodle/XML fidelity in staging.",
    },
  ];
}

export function getImportJobState(job: ImportJobLike, env: ProviderReadinessEnv = process.env): V3ImportJobState {
  const parser = String(job.parser ?? "");
  const status = String(job.status ?? "");
  const metadata = safeRecord(job.metadata_json);
  const externalState = String(job.external_state ?? "").toLowerCase();
  const retryCount = numberFrom(metadata.retry_count) ?? numberFrom(metadata.retryCount) ?? 0;

  if (requiresProvider(parser) && !providerConfiguredForParser(parser, env) && ["queued", "running"].includes(status)) {
    return "not_configured";
  }

  if (retryCount > 0 && ["queued", "running"].includes(status)) {
    return "retried";
  }

  if (status === "failed") return "failed";
  if (externalState.includes("low_confidence") || externalState.includes("low-confidence")) return "low_confidence";
  if (hasLowConfidence(metadata) && ["review_required", "succeeded"].includes(status)) return "low_confidence";
  if (status === "queued") return "queued";
  if (status === "running") return "processing";
  if (status === "review_required") return "needs_review";
  if (status === "succeeded") return "completed";

  return requiresProvider(parser) && !providerConfiguredForParser(parser, env) ? "not_configured" : "needs_review";
}

export function summarizeImportJobs(jobs: ImportJobLike[], env: ProviderReadinessEnv = process.env) {
  const byState = Object.fromEntries(V3_IMPORT_JOB_STATES.map((state) => [state, 0])) as Record<V3ImportJobState, number>;
  for (const job of jobs) {
    byState[getImportJobState(job, env)] += 1;
  }
  return {
    total: jobs.length,
    byState,
    actionRequired: byState.not_configured + byState.failed + byState.low_confidence + byState.needs_review,
    active: byState.queued + byState.processing + byState.retried,
    completed: byState.completed,
  };
}

export function estimateImportCostGuard(job: ImportJobLike, policy: ImportCostPolicy = {}): ImportCostGuard {
  const metadata = safeRecord(job.metadata_json);
  const pageCount = firstNumber(metadata.page_count, metadata.pageCount, metadata.pages, metadata.total_pages);
  const pagesProcessed = firstNumber(metadata.pages_processed, metadata.pagesProcessed, metadata.processed_pages);
  const retryCount = firstNumber(metadata.retry_count, metadata.retryCount) ?? 0;
  const estimatedCostUsd = firstNumber(metadata.estimated_cost_usd, metadata.estimatedCostUsd, metadata.cost_usd);
  const ownerQuotaUsd = firstNumber(metadata.owner_quota_usd, metadata.ownerQuotaUsd, metadata.provider_quota_usd);
  const provider = String(metadata.provider ?? job.parser ?? job.external_provider ?? "manual");
  const sourceLabel = sourceLabelFor(job.source_object_path ?? String(metadata.source_object_path ?? metadata.source ?? ""));
  const pageWarnThreshold = policy.pageWarnThreshold ?? 50;
  const costWarnThresholdUsd = policy.costWarnThresholdUsd ?? 5;
  const ownerLimitUsd = policy.ownerLimitUsd ?? ownerQuotaUsd;
  const reasons: ImportCostGuard["reasons"] = [];

  if (pageCount !== null && pageCount > pageWarnThreshold) reasons.push("large_page_count");
  if (estimatedCostUsd !== null && estimatedCostUsd >= costWarnThresholdUsd) reasons.push("cost_threshold");
  if (estimatedCostUsd !== null && ownerLimitUsd !== null && estimatedCostUsd >= ownerLimitUsd) reasons.push("owner_quota");
  if (requiresProvider(provider) && !providerConfiguredForParser(provider, policy.env ?? {})) reasons.push("provider_missing");

  return {
    pageCount,
    pagesProcessed,
    retryCount,
    provider,
    sourceLabel,
    estimatedCostUsd,
    ownerQuotaUsd,
    requiresConfirmation: reasons.length > 0,
    reasons: Array.from(new Set(reasons)),
  };
}

export function buildImportJobAuditSummary(auditLogs: ImportAuditLike[]) {
  const importLogs = auditLogs
    .filter((entry) => isImportAuditAction(entry.action));
  const latestImportLog = [...importLogs]
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  return {
    importAuditCount: importLogs.length,
    latestImportAuditAt: latestImportLog[0]?.created_at ?? null,
    actions: Array.from(new Set(importLogs.map((entry) => String(entry.action)).filter(Boolean))),
  };
}

export function buildImportGovernanceSummary({
  jobs,
  auditLogs = [],
  env = process.env,
  costPolicy = {},
}: {
  jobs: ImportJobLike[];
  auditLogs?: ImportAuditLike[];
  env?: ProviderReadinessEnv;
  costPolicy?: ImportCostPolicy;
}) {
  const jobSummary = summarizeImportJobs(jobs, env);
  const guards = jobs.map((job) => estimateImportCostGuard(job, { ...costPolicy, env }));
  const audit = buildImportJobAuditSummary(auditLogs);
  return {
    jobSummary,
    audit,
    jobsRequiringConfirmation: guards.filter((guard) => guard.requiresConfirmation).length,
    failedOrFallbackJobs: jobs.filter((job) => {
      const state = getImportJobState(job, env);
      return state === "failed" || state === "not_configured";
    }).length,
    totalEstimatedCostUsd: guards.reduce((total, guard) => total + (guard.estimatedCostUsd ?? 0), 0),
    totalPages: guards.reduce((total, guard) => total + (guard.pageCount ?? 0), 0),
    manualFallbackAvailable: true,
    costGuards: guards,
  };
}

export function buildSmartImportSampleQaPack(
  results: SmartImportSampleQaResult[] = [],
  env: ProviderReadinessEnv = process.env,
) {
  const resultByFixture = new Map(results.map((result) => [String(result.fixture_id ?? ""), result]));
  const items = SMART_IMPORT_SAMPLE_QA_FIXTURES.map((fixture): SmartImportSampleQaItem => {
    const result = resultByFixture.get(fixture.id);
    const providerConfigured = fixture.requiredProviders.every((provider) => providerConfiguredForFixture(provider, env));
    const normalizedStatus = normalizeSampleQaStatus(result?.status);
    const status: SmartImportSampleQaStatus = result
      ? normalizedStatus
      : providerConfigured
        ? "not_run"
        : "provider_required";
    const completedChecks = new Set((result?.checks ?? []).map(String));
    const missingChecks = fixture.expectedChecks.filter((check) => check !== "manual_fallback" && !completedChecks.has(check));

    return {
      fixture,
      status,
      provider: String(result?.provider ?? (fixture.requiredProviders.join(" + ") || "manual")),
      confidence: typeof result?.confidence === "number" && Number.isFinite(result.confidence) ? result.confidence : null,
      reviewedAt: result?.reviewed_at ?? null,
      missingChecks,
      ownerMessage: messageForSampleQaStatus(status, fixture),
    };
  });

  const summary = {
    passed: items.filter((item) => item.status === "passed").length,
    failed: items.filter((item) => item.status === "failed").length,
    needsReview: items.filter((item) => item.status === "needs_review").length,
    providerRequired: items.filter((item) => item.status === "provider_required").length,
    notRun: items.filter((item) => item.status === "not_run").length,
  };

  return {
    totalFixtures: items.length,
    providerBackedReady: summary.passed === items.length,
    manualFallbackAvailable: true,
    summary,
    items,
  };
}

export function evaluateBatchPdfImportPlan(
  files: BatchImportFileLike[],
  {
    env = process.env,
    maxFileSizeBytes = 10 * 1024 * 1024,
    pageEstimatePerPdf = 12,
    pageWarnThreshold = 60,
  }: {
    env?: ProviderReadinessEnv;
    maxFileSizeBytes?: number;
    pageEstimatePerPdf?: number;
    pageWarnThreshold?: number;
  } = {},
): BatchPdfImportPlan {
  const duplicateNames = findDuplicateNames(files.map((file) => file.name));
  const acceptedPdfs = files.filter(isPdfLike);
  const markschemeNames = acceptedPdfs.filter((file) => isMarkschemeFileName(file.name)).map((file) => file.name);
  const sourcePdfNames = acceptedPdfs.filter((file) => !isMarkschemeFileName(file.name)).map((file) => file.name);
  const issueCodes = new Set<BatchPdfImportIssueCode>();

  if (duplicateNames.length) issueCodes.add("duplicate_file_name");
  if (files.some((file) => file.sizeBytes > maxFileSizeBytes)) issueCodes.add("file_too_large");
  if (files.some((file) => !isPdfLike(file))) issueCodes.add("unsupported_file_type");
  if (!providerConfiguredForFixture("mineru", env)) issueCodes.add("ocr_provider_missing");

  const estimatedPages = acceptedPdfs.length * pageEstimatePerPdf;
  if (estimatedPages > pageWarnThreshold) issueCodes.add("large_batch_confirmation");

  return {
    totalFiles: files.length,
    acceptedPdfCount: acceptedPdfs.length,
    rejectedFileCount: files.length - acceptedPdfs.length,
    duplicateNames,
    estimatedPages,
    issueCodes: Array.from(issueCodes),
    requiresOwnerConfirmation: issueCodes.has("duplicate_file_name") || issueCodes.has("file_too_large") || issueCodes.has("large_batch_confirmation"),
    canSubmitToProvider: acceptedPdfs.length > 0
      && !issueCodes.has("ocr_provider_missing")
      && !issueCodes.has("unsupported_file_type")
      && !issueCodes.has("file_too_large"),
    manualFallbackAvailable: true,
    grouping: {
      sourcePdfNames,
      markschemeNames,
    },
  };
}

export function providerStatusTone(status: V3ProviderStatus) {
  if (status === "ready") return "success" as const;
  if (status === "blocked") return "danger" as const;
  if (status === "provider_required" || status === "staging_required") return "warning" as const;
  return "info" as const;
}

export function importJobStateTone(state: V3ImportJobState) {
  if (state === "completed") return "success" as const;
  if (state === "failed" || state === "not_configured") return "danger" as const;
  if (state === "low_confidence" || state === "needs_review" || state === "retried") return "warning" as const;
  if (state === "processing" || state === "queued") return "info" as const;
  return "neutral" as const;
}

function providerConfiguredForParser(parser: string, env: ProviderReadinessEnv) {
  if (parser === "mineru" || parser === "mineru_hosted") {
    return hasEnv(env, "MINERU_API_KEY") || hasEnv(env, "MINERU_WORKER_HMAC_SECRET");
  }
  if (parser === "deepseek_ai") return hasEnv(env, "DEEPSEEK_API_KEY");
  return true;
}

function providerConfiguredForFixture(provider: "mineru" | "deepseek" | "latex", env: ProviderReadinessEnv) {
  if (provider === "mineru") return hasEnv(env, "MINERU_API_KEY") || hasEnv(env, "MINERU_WORKER_HMAC_SECRET");
  if (provider === "deepseek") return hasEnv(env, "DEEPSEEK_API_KEY");
  return true;
}

function requiresProvider(parser: string) {
  return parser === "mineru" || parser === "mineru_hosted" || parser === "deepseek_ai";
}

function hasLowConfidence(metadata: Record<string, unknown>) {
  const confidence = [
    metadata.confidence,
    metadata.parse_confidence,
    metadata.layout_confidence,
    metadata.average_confidence,
    safeRecord(metadata.review).confidence,
  ]
    .map(numberFrom)
    .find((value) => typeof value === "number");
  return typeof confidence === "number" && confidence < 0.72;
}

function normalizeSampleQaStatus(status: SmartImportSampleQaResult["status"]): SmartImportSampleQaStatus {
  if (status === "passed" || status === "failed" || status === "needs_review" || status === "provider_required" || status === "not_run") return status;
  return "needs_review";
}

function messageForSampleQaStatus(status: SmartImportSampleQaStatus, fixture: SmartImportSampleFixture) {
  if (status === "passed") return `${fixture.title} passed the reviewed staging fixture.`;
  if (status === "failed") return `${fixture.title} failed staging QA and must use manual fallback or provider repair.`;
  if (status === "needs_review") return `${fixture.title} has provider output that still needs owner review.`;
  if (status === "provider_required") return `${fixture.title} needs provider setup before automated QA can run.`;
  return `${fixture.title} has no reviewed staging result yet.`;
}

function findDuplicateNames(names: string[]) {
  const counts = new Map<string, number>();
  for (const name of names) {
    const normalized = normalizeFileName(name);
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([name]) => name);
}

function normalizeFileName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function isPdfLike(file: BatchImportFileLike) {
  return file.contentType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isMarkschemeFileName(name: string) {
  const normalized = normalizeFileName(name).replace(/[-_]/g, " ");
  return normalized.includes("markscheme") || normalized.includes("mark scheme") || /\bms\b/.test(normalized);
}

function isImportAuditAction(action: string | null | undefined) {
  const value = String(action ?? "");
  return value.startsWith("mineru_")
    || value.startsWith("ai_parse.")
    || value.startsWith("assessment.ingested")
    || value.startsWith("qti.imported")
    || value.startsWith("markscheme_");
}

function safeRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberFrom(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = numberFrom(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function sourceLabelFor(path: string) {
  const cleaned = path.trim();
  if (!cleaned) return "Manual source";
  const parts = cleaned.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? cleaned;
}

function hasEnv(env: ProviderReadinessEnv, name: string) {
  const value = env[name]?.trim();
  if (!value) return false;
  return !["placeholder", "changeme", "change-me", "todo"].includes(value.toLowerCase());
}
