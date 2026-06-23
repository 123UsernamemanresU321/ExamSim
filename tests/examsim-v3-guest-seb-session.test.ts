import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Examsim V3 guest SEB session boundary", () => {
  it("creates a guest-token-bound attempt session without placing the token in the URL", () => {
    const start = read("supabase/functions/guest-start-attempt-session/index.ts");
    expect(start).toContain("verifyGuestAttemptToken");
    expect(start).toContain('from("attempt_sessions")');
    expect(start).toContain("user_agent_hash");
    expect(start).toContain("enforceRateLimit");
    expect(start).toContain("guest-attempt-session:attempt");
    expect(start).toContain("idempotent: true");
    expect(start).not.toContain("guest_token=");
  });

  it("binds guest state tokens to an active attempt session", () => {
    const state = read("supabase/functions/guest-get-attempt-state/index.ts");
    expect(state).toContain("attempt_session_id");
    expect(state).toContain('from("attempt_sessions")');
    expect(state).toContain("attempt_session_id: attemptSession.id");
  });

  it("validates URL-specific BEK and CK evidence and retains a short TTL", () => {
    const verify = read("supabase/functions/guest-seb-verify-session/index.ts");
    const shared = read("supabase/functions/_shared/seb.ts");
    expect(verify).toContain("verifyGuestAttemptToken");
    expect(verify).toContain("verifySebRequestHashes");
    expect(verify).toContain("validateGuestSebPageUrl");
    expect(verify).toContain("seb_verified_at");
    expect(shared).toContain('parsed.pathname !== "/exam/live"');
    expect(shared).toContain('parsed.searchParams.get("attempt_session") !== attemptSessionId');
    expect(verify).toContain('body.mode !== "js_api"');
    expect(verify).not.toContain("extractSebRequestHashes");
  });

  it("releases guest SEB packages only with fresh matching session evidence", () => {
    const source = read("supabase/functions/guest-get-attempt-package/index.ts");
    expect(source).not.toContain("Guest SEB sessions are blocked");
    expect(source).toContain("sebVerificationTtlSeconds");
    expect(source).toContain("verifySebRequestHashes");
    expect(source).toContain("statePayload.attempt_session_id");
    expect(source).toContain("guestSebEnabled");
  });

  it("starts and verifies the guest session from the no-login workspace", () => {
    const workspace = read("components/exam/guest-exam-workspace.tsx");
    expect(workspace).toContain('"guest-start-attempt-session"');
    expect(workspace).toContain('"guest-seb-verify-session"');
    expect(workspace).toContain("attempt_session");
    expect(workspace).toContain("function bindGuestSessionToUrl");
    expect(workspace).toContain("async function readGuestSebJsApiEvidence");
    expect(workspace).toContain("SafeExamBrowser");
  });

  it("copies validated session BEK and CK keys into guest attempts", () => {
    const form = read("components/owner/exam-session-form.tsx");
    const action = read("app/owner/exam-sessions/actions.ts");
    const join = read("supabase/functions/join-exam-session/index.ts");
    expect(form).toContain('name="seb_browser_exam_key_hashes"');
    expect(form).toContain('name="seb_config_key_hashes"');
    expect(action).toContain("validateSebPublishKeys");
    expect(join).toContain("security_settings_json");
    expect(join).toContain("seb_browser_exam_key_hashes");
    expect(join).toContain("guestSebEnabled");
  });

  it("deploys guest session functions without platform JWT and retains app-level token checks", () => {
    const config = read("supabase/config.toml");
    expect(config).toContain("[functions.guest-start-attempt-session]\nverify_jwt = false");
    expect(config).toContain("[functions.guest-seb-verify-session]\nverify_jwt = false");
  });
});
