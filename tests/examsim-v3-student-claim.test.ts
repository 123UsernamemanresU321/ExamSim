import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Examsim V3 secure student attempt claiming", () => {
  it("provides real owner issuance and authenticated student redemption boundaries", () => {
    expect(existsSync("supabase/functions/owner-issue-attempt-claim-code/index.ts")).toBe(true);
    expect(existsSync("supabase/functions/claim-guest-attempt/index.ts")).toBe(true);
  });

  it("replaces the placeholder account-linking page with a claim form", () => {
    const page = readFileSync("app/exam/link-account/page.tsx", "utf8");
    expect(page).toContain("StudentAttemptClaimForm");
    expect(page).not.toContain("is prepared in the data model");
  });

  it("tracks expiring one-time codes and review ownership in the database", () => {
    const migrationFile = readdirSync("supabase/migrations").find((file) => file.includes("v3_student_claim_flow"));
    expect(migrationFile).toBeTruthy();
    const migrations = readFileSync(`supabase/migrations/${migrationFile}`, "utf8");
    expect(migrations).toContain("claim_code_expires_at");
    expect(migrations).toContain("claim_code_used_at");
    expect(migrations).toContain("claim_requested_by_profile_id");
    expect(migrations).not.toMatch(/to\s+anon/i);
  });

  it("uses AAL2, rate limits, atomic consumption, and never stores plaintext codes", () => {
    const issue = readFileSync("supabase/functions/owner-issue-attempt-claim-code/index.ts", "utf8");
    const redeem = readFileSync("supabase/functions/claim-guest-attempt/index.ts", "utf8");
    const migrationFile = readdirSync("supabase/migrations").find((file) => file.includes("v3_student_claim_flow"));
    const migration = readFileSync(`supabase/migrations/${migrationFile}`, "utf8");
    expect(issue).toContain("requireInstitutionAal2");
    expect(issue).toContain("enforceRateLimit");
    expect(issue).toContain("hashAttemptClaimCode");
    expect(issue).not.toContain("claim_code_plaintext");
    expect(redeem).toContain('rpc("consume_attempt_claim_code"');
    expect(redeem).toContain('profile.app_role !== "student"');
    expect(migration).toContain("for update");
    expect(migration).toContain("grant execute on function public.consume_attempt_claim_code(text, uuid) to service_role");
  });

  it("lets owners issue codes and approve or reject ambiguous claim requests", () => {
    const page = readFileSync("app/owner/exam-sessions/[id]/reconcile/page.tsx", "utf8");
    const actions = readFileSync("app/owner/exam-sessions/[id]/reconcile/actions.ts", "utf8");
    const rolloutMigration = readdirSync("supabase/migrations").find((file) => file.includes("v3_institution_permission_rollout"));
    const migration = readFileSync(`supabase/migrations/${rolloutMigration}`, "utf8");
    expect(page).toContain("AttemptClaimCodeManager");
    expect(page).toContain("approveAttemptClaimAction");
    expect(page).toContain("rejectAttemptClaimAction");
    expect(actions).toContain('requireInstitutionPermission("student_management"');
    expect(actions).toContain('rpc("institution_link_guest_attempt"');
    expect(actions).toContain('rpc("institution_review_attempt_claim"');
    expect(migration).toContain("create or replace function public.institution_review_attempt_claim");
    expect(migration).toContain("claim_status = 'linked'");
    expect(migration).toContain("claim_status = 'rejected'");
  });
});
