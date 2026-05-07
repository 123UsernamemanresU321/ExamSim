import { describe, expect, it } from "vitest";
import {
  defaultTotpFriendlyName,
  displayTotpFriendlyName,
  mfaEnrollmentErrorMessage,
  normalizeTotpFriendlyName,
} from "@/lib/auth/mfa";

describe("MFA factor helpers", () => {
  it("generates a non-empty default TOTP friendly name", () => {
    expect(defaultTotpFriendlyName(new Date("2026-05-07T06:30:00.000Z"))).toBe(
      "Exam Vault authenticator 2026-05-07 06:30",
    );
  });

  it("normalizes blank TOTP names to a unique visible fallback", () => {
    expect(normalizeTotpFriendlyName("   ", new Date("2026-05-07T06:30:00.000Z"))).toBe(
      "Exam Vault authenticator 2026-05-07 06:30",
    );
    expect(normalizeTotpFriendlyName(" Apple Passwords ")).toBe("Apple Passwords");
  });

  it("displays unnamed legacy factors clearly", () => {
    expect(displayTotpFriendlyName({ friendly_name: "" })).toBe("Unnamed authenticator");
  });

  it("turns duplicate friendly-name errors into actionable copy", () => {
    expect(mfaEnrollmentErrorMessage('A factor with the friendly name "" for this user already exists')).toContain(
      "Use a different name",
    );
  });
});
