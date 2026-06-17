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
  external_state?: string | null;
  metadata_json?: unknown;
  error_message?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
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

function hasEnv(env: ProviderReadinessEnv, name: string) {
  const value = env[name]?.trim();
  if (!value) return false;
  return !["placeholder", "changeme", "change-me", "todo"].includes(value.toLowerCase());
}
