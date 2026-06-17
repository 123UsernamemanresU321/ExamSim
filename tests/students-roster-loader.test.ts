import { describe, expect, it, vi } from "vitest";

async function importLiveDataWithRosterError(error: { code?: string; message?: string }) {
  vi.resetModules();
  vi.doMock("@/lib/runtime", () => ({
    isDemoModeEnabled: () => false,
  }));
  vi.doMock("@/lib/supabase/server", () => ({
    createSupabaseServerClient: async () => ({
      from: (table: string) => {
        expect(table).toBe("student_roster_entries");
        return {
          select: () => ({
            order: async () => ({ data: null, error }),
          }),
        };
      },
    }),
  }));
  return import("@/lib/live-data");
}

describe("student roster loader", () => {
  it("does not hard-fail the owner students page when the roster migration is missing", async () => {
    const { listOwnerRosterEntries } = await importLiveDataWithRosterError({
      code: "PGRST205",
      message: "Could not find the table 'public.student_roster_entries' in the schema cache",
    });

    await expect(listOwnerRosterEntries()).resolves.toEqual([]);
  });

  it("does not hide unrelated roster query errors", async () => {
    const { listOwnerRosterEntries } = await importLiveDataWithRosterError({
      code: "42501",
      message: "permission denied for table student_roster_entries",
    });

    await expect(listOwnerRosterEntries()).rejects.toMatchObject({ code: "42501" });
  });
});
