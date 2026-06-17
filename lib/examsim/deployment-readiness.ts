export type DeploymentReadinessKey =
  | "env_core"
  | "supabase_migrations"
  | "rls_policies"
  | "private_storage"
  | "edge_functions"
  | "provider_status"
  | "seed_accounts"
  | "security_claims";

export type DeploymentReadinessStatus = "ready" | "manual_validation" | "blocked" | "provider_gated";

export type DeploymentReadinessEnv = Partial<Record<string, string | undefined>>;

export type DeploymentReadinessItem = {
  key: DeploymentReadinessKey;
  title: string;
  status: DeploymentReadinessStatus;
  ownerMessage: string;
  evidence: string;
  nextAction: string;
  requiredEnvVars: string[];
};

export function buildDeploymentReadinessChecklist(env: DeploymentReadinessEnv = process.env): DeploymentReadinessItem[] {
  const hasCoreEnv = hasEnv(env, "APP_ALLOWED_ORIGINS")
    && hasEnv(env, "ATTEMPT_STATE_TOKEN_SECRET")
    && hasEnv(env, "NEXT_PUBLIC_SUPABASE_URL")
    && hasEnv(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const hasAiProvider = hasEnv(env, "DEEPSEEK_API_KEY");
  const hasOcrProvider = hasEnv(env, "MINERU_API_KEY") || hasEnv(env, "MINERU_WORKER_HMAC_SECRET");

  return [
    {
      key: "env_core",
      title: "Core environment variables",
      status: hasCoreEnv ? "ready" : "blocked",
      ownerMessage: hasCoreEnv
        ? "Core app origin, attempt-token, and Supabase public configuration are present."
        : "High-stakes delivery must stay blocked until core origin, attempt-token, and Supabase configuration are present.",
      evidence: "Server-side env check only; no secret values are rendered.",
      nextAction: "Set APP_ALLOWED_ORIGINS, ATTEMPT_STATE_TOKEN_SECRET, NEXT_PUBLIC_SUPABASE_URL, and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      requiredEnvVars: ["APP_ALLOWED_ORIGINS", "ATTEMPT_STATE_TOKEN_SECRET", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    },
    {
      key: "supabase_migrations",
      title: "Supabase migrations",
      status: "manual_validation",
      ownerMessage: "Migration status must be validated in staging before launch; this page does not mutate database history.",
      evidence: "Run `supabase migration list` and apply migrations in staging.",
      nextAction: "Confirm all local migrations are applied to staging and production with no failed statements.",
      requiredEnvVars: [],
    },
    {
      key: "rls_policies",
      title: "RLS and exposed API policy review",
      status: "manual_validation",
      ownerMessage: "Owner/student/guest data boundaries require staging RLS checks with synthetic users.",
      evidence: "Repo rules require no broad student access to assessment_versions or question_nodes.",
      nextAction: "Run owner, student A/B, guest, and unauthenticated access tests against staging.",
      requiredEnvVars: [],
    },
    {
      key: "private_storage",
      title: "Private storage buckets",
      status: "manual_validation",
      ownerMessage: "Assessment sources, packages, answers, and marking packets must remain private and signed.",
      evidence: "Storage must be checked in Supabase dashboard or staging scripts.",
      nextAction: "Verify assessment-sources, assessment-packages, answer-uploads, and marking-packets are not public.",
      requiredEnvVars: [],
    },
    {
      key: "edge_functions",
      title: "Edge function deployment",
      status: hasCoreEnv ? "manual_validation" : "blocked",
      ownerMessage: "Guest access, upload signing, parsing, and finalization rely on deployed Edge/server boundaries.",
      evidence: "Local build can compile routes; Edge deployment must be verified separately.",
      nextAction: "Deploy Edge Functions and run the synthetic no-login and authenticated exam QA flows.",
      requiredEnvVars: ["APP_ALLOWED_ORIGINS", "ATTEMPT_STATE_TOKEN_SECRET"],
    },
    {
      key: "provider_status",
      title: "OCR, AI, and email providers",
      status: hasAiProvider && hasOcrProvider ? "manual_validation" : "provider_gated",
      ownerMessage: hasAiProvider && hasOcrProvider
        ? "AI/OCR provider keys are present; sample-paper and spend-limit validation is still required."
        : "Provider-backed OCR/AI must stay gated. Manual PDF, LaTeX, and deterministic workflows remain available.",
      evidence: "Provider config is detected by env names only, never by exposing values.",
      nextAction: "Set provider keys server-side, configure spend caps, and run sample-paper QA before advertising automated import.",
      requiredEnvVars: ["DEEPSEEK_API_KEY", "MINERU_API_KEY or MINERU_WORKER_HMAC_SECRET"],
    },
    {
      key: "seed_accounts",
      title: "Seed accounts and QA fixtures",
      status: "manual_validation",
      ownerMessage: "Launch QA needs synthetic owner, student, guest, marked attempt, and upload fixtures.",
      evidence: "E2E tests cover demo mode; staging must cover real Supabase data.",
      nextAction: "Create staging-only seed accounts and sample exams; never seed real student data into public demos.",
      requiredEnvVars: [],
    },
    {
      key: "security_claims",
      title: "Security-mode wording and claims",
      status: "manual_validation",
      ownerMessage: "Browser Mode must stay described as tamper-evident, not tamper-proof. Guest SEB remains blocked.",
      evidence: "Docs and UI must avoid unsupported lockdown claims.",
      nextAction: "Review public, owner, and student screens for security wording before launch.",
      requiredEnvVars: [],
    },
  ];
}

export function summarizeDeploymentReadiness(items: DeploymentReadinessItem[]) {
  return {
    total: items.length,
    ready: count(items, "ready"),
    blocked: count(items, "blocked"),
    manualValidation: count(items, "manual_validation"),
    providerGated: count(items, "provider_gated"),
  };
}

export function deploymentReadinessTone(status: DeploymentReadinessStatus) {
  if (status === "ready") return "success" as const;
  if (status === "blocked") return "danger" as const;
  if (status === "provider_gated" || status === "manual_validation") return "warning" as const;
  return "neutral" as const;
}

function count(items: DeploymentReadinessItem[], status: DeploymentReadinessStatus) {
  return items.filter((item) => item.status === status).length;
}

function hasEnv(env: DeploymentReadinessEnv, name: string) {
  const value = env[name]?.trim();
  if (!value) return false;
  return !["placeholder", "changeme", "change-me", "todo"].includes(value.toLowerCase());
}
