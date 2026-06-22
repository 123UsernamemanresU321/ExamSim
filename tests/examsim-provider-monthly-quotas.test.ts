import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

function migrationSource() {
  const filename = readdirSync("supabase/migrations")
    .find((name) => name.endsWith("_v3_provider_monthly_quotas_and_sample_qa.sql"));
  expect(filename).toBeTruthy();
  return readFileSync(`supabase/migrations/${filename}`, "utf8");
}

describe("provider monthly quotas and live Smart Import QA", () => {
  it("keeps the quota ledger service-role-only and consumes quota atomically", () => {
    const migration = migrationSource();

    expect(migration).toContain("create table if not exists public.provider_monthly_usage");
    expect(migration).toContain("alter table public.provider_monthly_usage enable row level security");
    expect(migration).toContain("revoke all on table public.provider_monthly_usage from anon, authenticated");
    expect(migration).toContain("create or replace function public.consume_provider_monthly_quota");
    expect(migration).toContain("on conflict (owner_profile_id, provider, unit, period_start)");
    expect(migration).toContain("grant execute on function public.consume_provider_monthly_quota");
    expect(migration).not.toMatch(/create policy[^;]+provider_monthly_usage/is);
  });

  it("enforces the supplied DeepSeek, MinerU, and SimpleTeX monthly limits before provider calls", () => {
    const helper = readFileSync("supabase/functions/_shared/provider-quota.ts", "utf8");
    const deepseek = readFileSync("supabase/functions/ai-parse-assessment/index.ts", "utf8");
    const grouping = readFileSync("supabase/functions/semantic-group-answers/index.ts", "utf8");
    const mineru = readFileSync("supabase/functions/mineru-submit-hosted-job/index.ts", "utf8");
    const simpletex = readFileSync("supabase/functions/simpletex-ocr-source-page/index.ts", "utf8");

    expect(helper).toContain('admin.rpc("consume_provider_monthly_quota"');
    expect(deepseek).toContain('envNumber("DEEPSEEK_OWNER_MONTHLY_USD_LIMIT", 20)');
    expect(grouping).toContain('envNumber("DEEPSEEK_OWNER_MONTHLY_USD_LIMIT", 20)');
    expect(mineru).toContain('envNumber("MINERU_OWNER_MONTHLY_PAGE_LIMIT", 200)');
    expect(simpletex).toContain('envNumber("SIMPLETEX_OWNER_MONTHLY_PAGE_LIMIT", 200)');
  });

  it("hard-caps DeepSeek requests and disables paid thinking output", () => {
    const parser = readFileSync("supabase/functions/ai-parse-assessment/index.ts", "utf8");
    const grouping = readFileSync("supabase/functions/semantic-group-answers/index.ts", "utf8");
    const reviewPanel = readFileSync("components/owner/ai-parse-review-panel.tsx", "utf8");

    expect(parser).toContain('envInt("AI_PARSE_MAX_OUTPUT_TOKENS", 24_000)');
    expect(parser).toContain('thinking: { type: "disabled" }');
    expect(parser).toContain("max_tokens: maxOutputTokens");
    expect(parser).toContain("MAX_EXISTING_PACKAGE_CONTEXT_CHARS");
    expect(parser).toContain("MAX_MARKSCHEME_CONTEXT_CHARS");
    expect(grouping).toContain('thinking: { type: "disabled" }');
    expect(reviewPanel).not.toContain("package: version.normalized_package_json");
  });

  it("stores owner-readable reviewed sample QA without allowing browser writes", () => {
    const migration = migrationSource();
    const page = readFileSync("app/owner/security/page.tsx", "utf8");
    const dashboard = readFileSync("components/owner/provider-readiness-dashboard.tsx", "utf8");

    expect(migration).toContain("create table if not exists public.smart_import_qa_results");
    expect(migration).toContain("grant select on public.smart_import_qa_results to authenticated");
    expect(migration).toContain("revoke insert, update, delete on public.smart_import_qa_results from anon, authenticated");
    expect(page).toContain('.from("smart_import_qa_results")');
    expect(dashboard).toContain("sampleQaResults");
    expect(dashboard).toContain("Expected 12 questions / 110 marks");
  });

  it("provides a credential-safe synthetic account provisioning command", () => {
    expect(existsSync("scripts/provision-qa-accounts.mjs")).toBe(true);
    const script = readFileSync("scripts/provision-qa-accounts.mjs", "utf8");
    const gitignore = readFileSync(".gitignore", "utf8");

    expect(script).toContain("qa-accounts.local.json");
    expect(script).toContain("institution_memberships");
    expect(script).toContain("email_confirm: true");
    expect(script).toContain("admin.auth.admin.mfa.listFactors");
    expect(script).toContain("admin.auth.admin.mfa.deleteFactor");
    expect(script).not.toContain("console.log(password)");
    expect(gitignore).toContain(".qa-accounts.local.json");
  });
});
