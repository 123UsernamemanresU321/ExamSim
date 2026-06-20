import { describe, expect, it, vi } from "vitest";

async function importStudentActionsWithRosterLinkClient() {
  vi.resetModules();
  const revalidatePath = vi.fn();
  const updates: Array<{ id: string; ownerId: string; studentProfileId: string | null }> = [];
  const auditEvents: string[] = [];

  vi.doMock("next/cache", () => ({
    revalidatePath,
  }));
  vi.doMock("@/lib/examsim/institution-roles", () => ({
    requireInstitutionPermission: async () => ({ ownerProfileId: "owner-1", profileId: "owner-1", role: "owner_admin", permissions: ["student_management"] }),
  }));
  vi.doMock("@/lib/examsim/institution-audit", () => ({
    auditInstitutionAction: async ({ action }: { action: string }) => {
      auditEvents.push(action);
    },
  }));
  vi.doMock("@/lib/owner-operations", () => ({
    asJson: (value: unknown) => value,
  }));
  vi.doMock("@/lib/supabase/admin", () => ({
    getSupabaseAdminClient: () => {
      throw new Error("Supabase admin should not be required for roster-account linking");
    },
  }));
  vi.doMock("@/lib/supabase/server", () => ({
    createSupabaseServerClient: async () => ({
      from: (table: string) => {
        if (table === "student_roster_entries") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "roster-1",
                    owner_profile_id: "owner-1",
                    student_number: "DP1-001",
                    display_name: "Student One",
                    student_profile_id: null,
                  },
                  error: null,
                }),
              }),
            }),
            update: (payload: { student_profile_id: string | null }) => ({
              eq: (_column: string, id: string) => ({
                eq: (_ownerColumn: string, ownerId: string) => {
                  updates.push({ id, ownerId, studentProfileId: payload.student_profile_id });
                  return Promise.resolve({ error: null });
                },
              }),
            }),
          };
        }
        if (table === "profiles") {
          return {
            select: () => ({
              eq: (_idColumn: string, id: string) => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id,
                      app_role: "student",
                      display_name: "Student One",
                      owner_profile_id: "owner-1",
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "owner_student_links") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    }),
  }));

  const actions = await import("@/app/owner/students/actions");
  return { ...actions, updates, auditEvents, revalidatePath };
}

describe("student roster account linking", () => {
  it("links a roster student number to a managed student account without requiring Supabase admin access", async () => {
    const { linkRosterEntryToStudentAccountAction, updates, auditEvents, revalidatePath } =
      await importStudentActionsWithRosterLinkClient();
    const formData = new FormData();
    formData.set("roster_entry_id", "roster-1");
    formData.set("student_profile_id", "student-1");

    await expect(linkRosterEntryToStudentAccountAction(formData)).resolves.toMatchObject({ ok: true });
    expect(updates).toEqual([{ id: "roster-1", ownerId: "owner-1", studentProfileId: "student-1" }]);
    expect(auditEvents).toEqual(["roster_entry.account_linked"]);
    expect(revalidatePath).toHaveBeenCalledWith("/owner/students");
    expect(revalidatePath).toHaveBeenCalledWith("/owner/exam-sessions");
  });

  it("unlinks a roster student number from an optional student account", async () => {
    const { linkRosterEntryToStudentAccountAction, updates, auditEvents } =
      await importStudentActionsWithRosterLinkClient();
    const formData = new FormData();
    formData.set("roster_entry_id", "roster-1");
    formData.set("student_profile_id", "");

    await expect(linkRosterEntryToStudentAccountAction(formData)).resolves.toMatchObject({ ok: true });
    expect(updates).toEqual([{ id: "roster-1", ownerId: "owner-1", studentProfileId: null }]);
    expect(auditEvents).toEqual(["roster_entry.account_unlinked"]);
  });
});
