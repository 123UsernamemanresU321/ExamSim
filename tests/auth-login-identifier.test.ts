import { describe, expect, it } from "vitest";
import { isAppRole, normalizeLoginIdentifier } from "@/lib/auth/login-identifier";

describe("login identifier normalization", () => {
  it("maps student login codes to the internal Supabase alias", () => {
    expect(normalizeLoginIdentifier(" STU-ABCD ")).toBe("stu-abcd@students.local.exam-vault");
  });

  it("keeps owner email identifiers as lower-case email addresses", () => {
    expect(normalizeLoginIdentifier("Owner@Example.COM")).toBe("owner@example.com");
  });

  it("recognizes only Exam Vault app roles", () => {
    expect(isAppRole("owner")).toBe(true);
    expect(isAppRole("student")).toBe(true);
    expect(isAppRole("admin")).toBe(false);
  });
});
