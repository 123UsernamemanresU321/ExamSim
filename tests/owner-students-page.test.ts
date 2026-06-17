import { describe, expect, it, vi } from "vitest";

async function importStudentsPageWithLoaderFailures() {
  vi.resetModules();
  vi.doMock("@/lib/live-data", () => ({
    listOwnerStudents: async () => {
      throw new Error("profiles query failed");
    },
    listOwnerStudentGroups: async () => [],
    listOwnerRosterEntries: async () => {
      throw new Error("roster query failed");
    },
  }));
  return import("@/app/owner/students/page");
}

describe("owner students page", () => {
  it("renders a recoverable page instead of throwing when one or more student loaders fail", async () => {
    const { default: OwnerStudentsPage } = await importStudentsPageWithLoaderFailures();

    await expect(OwnerStudentsPage()).resolves.toMatchObject({ type: Symbol.for("react.fragment") });
  });
});
