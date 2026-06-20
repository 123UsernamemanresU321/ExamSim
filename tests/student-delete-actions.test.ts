import { describe, expect, it, vi } from "vitest";

async function importStudentActionsWithAdminFailure() {
  vi.resetModules();
  vi.doMock("next/cache", () => ({
    revalidatePath: vi.fn(),
  }));
  vi.doMock("@/lib/examsim/institution-roles", () => ({
    requireInstitutionPermission: async () => ({ ownerProfileId: "owner-1", profileId: "owner-1", role: "owner_admin", permissions: ["student_management"] }),
  }));
  vi.doMock("@/lib/examsim/institution-audit", () => ({
    auditInstitutionAction: async () => undefined,
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

async function importStudentActionsWithWorkingOwnerClientAndMissingAdmin() {
  vi.resetModules();
  const revalidatePath = vi.fn();
  const deletedRows: string[] = [];
  const deletedProfiles: string[] = [];
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
  vi.doMock("@/lib/supabase/server", () => ({
    createSupabaseServerClient: async () => ({
      from: (table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: (_column: string, value: string) => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: value,
                      auth_user_id: "auth-student-1",
                      app_role: "student",
                      display_name: "Student One",
                      owner_profile_id: "owner-1",
                    },
                    error: null,
                  }),
                }),
              }),
            }),
            delete: () => ({
              eq: (_column: string, value: string) => ({
                eq: async () => {
                  deletedProfiles.push(value);
                  return { error: null };
                },
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
                    maybeSingle: async () => ({ data: { id: "link-1" }, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
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
                  },
                  error: null,
                }),
              }),
            }),
            delete: () => ({
              eq: (column: string, value: string) => ({
                eq: async () => {
                  expect(column).toBe("id");
                  deletedRows.push(value);
                  return { error: null };
                },
              }),
            }),
          };
        }
        if (table === "attempts") {
          return {
            select: () => ({
              eq: async () => ({ count: 0, error: null }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    }),
  }));
  vi.doMock("@/lib/supabase/admin", () => ({
    getSupabaseAdminClient: () => {
      throw new Error("Missing Supabase admin environment variables");
    },
  }));
  const actions = await import("@/app/owner/students/actions");
  return { ...actions, deletedRows, deletedProfiles, auditEvents, revalidatePath };
}

describe("student delete server actions", () => {
  it("deletes unused student app accounts without requiring Supabase Auth admin access", async () => {
    const { deleteStudentAccountAction, deletedProfiles, auditEvents, revalidatePath } =
      await importStudentActionsWithWorkingOwnerClientAndMissingAdmin();

    await expect(deleteStudentAccountAction("student-1")).resolves.toEqual({ ok: true });
    expect(deletedProfiles).toEqual(["student-1"]);
    expect(auditEvents).toEqual(["student.delete_requested", "student.deleted"]);
    expect(revalidatePath).toHaveBeenCalledWith("/owner/students");
  });

  it("returns a structured failure instead of rejecting when roster deletion cannot run", async () => {
    const { deleteRosterEntryAction } = await importStudentActionsWithAdminFailure();

    await expect(deleteRosterEntryAction("roster-1")).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("roster number could not be deleted"),
    });
  });

  it("deletes unused roster numbers without requiring Supabase admin access", async () => {
    const { deleteRosterEntryAction, deletedRows, auditEvents, revalidatePath } =
      await importStudentActionsWithWorkingOwnerClientAndMissingAdmin();

    await expect(deleteRosterEntryAction("roster-1")).resolves.toEqual({ ok: true });
    expect(deletedRows).toEqual(["roster-1"]);
    expect(auditEvents).toEqual(["roster_entry.delete_requested", "roster_entry.deleted"]);
    expect(revalidatePath).toHaveBeenCalledWith("/owner/students");
  });
});
