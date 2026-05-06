import { describe, expect, it } from "vitest";
import { dashboardPathForRole, postLoginRedirectForRole } from "@/lib/auth/routing";

describe("auth routing", () => {
  it("maps roles to their dashboards", () => {
    expect(dashboardPathForRole("owner")).toBe("/owner");
    expect(dashboardPathForRole("student")).toBe("/student");
  });

  it("allows same-role internal next paths", () => {
    expect(postLoginRedirectForRole("owner", "/owner/assessments")).toBe("/owner/assessments");
    expect(postLoginRedirectForRole("student", "/student/attempts/attempt_1/waiting")).toBe(
      "/student/attempts/attempt_1/waiting",
    );
  });

  it("falls back for cross-role or unsafe next paths", () => {
    expect(postLoginRedirectForRole("owner", "/student")).toBe("/owner");
    expect(postLoginRedirectForRole("student", "/owner")).toBe("/student");
    expect(postLoginRedirectForRole("owner", "//example.com")).toBe("/owner");
  });
});
