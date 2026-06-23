import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PUBLIC_EDGE_FUNCTIONS = [
  "activate-student",
  "resolve-exam-code",
  "join-exam-session",
  "guest-start-attempt-session",
  "guest-get-attempt-state",
  "guest-seb-verify-session",
  "guest-get-attempt-package",
  "guest-get-attempt-resources",
  "guest-save-response",
  "guest-issue-upload-slot-url",
  "guest-confirm-upload-slot",
  "guest-finalize-attempt",
  "guest-send-invigilation-message",
  "guest-acknowledge-invigilation-message",
] as const;

describe("public Edge function deployment configuration", () => {
  it("disables platform JWT only for no-login functions that enforce app-level tokens", () => {
    const config = readFileSync("supabase/config.toml", "utf8");
    for (const functionName of PUBLIC_EDGE_FUNCTIONS) {
      expect(config, functionName).toContain(`[functions.${functionName}]\nverify_jwt = false`);
    }
  });
});
