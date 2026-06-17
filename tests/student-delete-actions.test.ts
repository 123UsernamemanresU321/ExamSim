import { describe, expect, it, vi } from "vitest";

async function importStudentActionsWithAdminFailure() {
  vi.resetModules();
  vi.doMock("next/cache", () => ({
    revalidatePath: vi.fn(),
  }));
  vi.doMock("@/lib/examsim/session-data", () => ({
    requireOwnerProfileId: async () => "owner-1",
  }));
  vi.doMock("@/lib/owner-operations", () => ({
    asJson: (value: unknown) => value,
  }));
  vi.doMock("@/lib/supabase/server", () => ({
    createSupabaseServerClient: async () => ({
      rpc: async () => ({ error: null }),
    }),
  }));
  vi.doMock("@/lib/supabase/admin", () => ({
    getSupabaseAdminClient: () => {
      throw new Error("Missing Supabase admin environment variables");
    },
  }));
  return import("@/app/owner/students/actions");
}

describe("student delete server actions", () => {
  it("returns a structured failure instead of rejecting when student-account deletion cannot run", async () => {
    const { deleteStudentAccountAction } = await importStudentActionsWithAdminFailure();

    await expect(deleteStudentAccountAction("student-1")).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("Student account deletion is not configured"),
    });
  });

  it("returns a structured failure instead of rejecting when roster deletion cannot run", async () => {
    const { deleteRosterEntryAction } = await importStudentActionsWithAdminFailure();

    await expect(deleteRosterEntryAction("roster-1")).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("Roster number deletion is not available"),
    });
  });
});
