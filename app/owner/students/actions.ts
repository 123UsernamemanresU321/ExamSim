"use server";

import { revalidatePath } from "next/cache";
import { buildStudentNumber, normalizeStudentNumber } from "@/lib/examsim/guest-access";
import { requireOwnerProfileId } from "@/lib/examsim/session-data";
import { asJson } from "@/lib/owner-operations";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StudentDeleteActionResult = { ok: true } | { ok: false; message: string };
type SupabaseDataClient = Pick<Awaited<ReturnType<typeof createSupabaseServerClient>>, "from">;

export async function createRosterEntryAction(formData: FormData) {
  const ownerProfileId = await requireOwnerProfileId();
  const displayName = requiredString(formData, "display_name");
  const studentNumber = normalizeStudentNumber(requiredString(formData, "student_number"));
  const classGroup = String(formData.get("class_group") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("student_roster_entries").insert({
    owner_profile_id: ownerProfileId,
    display_name: displayName,
    student_number: studentNumber,
    class_group: classGroup,
    email,
    active: true,
  });
  if (error) throw error;
  revalidatePath("/owner/students");
}

export async function generateRosterEntriesAction(formData: FormData) {
  const ownerProfileId = await requireOwnerProfileId();
  const prefix = requiredString(formData, "prefix");
  const count = clampInteger(Number(formData.get("count") ?? 0), 1, 200);
  const firstOrdinal = clampInteger(Number(formData.get("first_ordinal") ?? 1), 1, 9999);
  const classGroup = String(formData.get("class_group") ?? "").trim() || null;
  const supabase = await createSupabaseServerClient();
  const entries = Array.from({ length: count }, (_, index) => {
    const studentNumber = buildStudentNumber(prefix, firstOrdinal + index);
    return {
      owner_profile_id: ownerProfileId,
      display_name: `Student ${studentNumber}`,
      student_number: studentNumber,
      class_group: classGroup,
      active: true,
      notes: "Generated roster placeholder. Edit the display name when assigning this number.",
    };
  });
  const numbers = entries.map((entry) => entry.student_number);
  const { data: existing, error: existingError } = await supabase
    .from("student_roster_entries")
    .select("student_number")
    .eq("owner_profile_id", ownerProfileId)
    .in("student_number", numbers);
  if (existingError) throw existingError;
  if (existing?.length) {
    throw new Error(`Duplicate student number${existing.length === 1 ? "" : "s"}: ${existing.map((entry) => entry.student_number).join(", ")}`);
  }
  const { error } = await supabase.from("student_roster_entries").insert(entries);
  if (error) throw error;
  revalidatePath("/owner/students");
}

export async function deleteStudentAccountAction(studentProfileId: string): Promise<StudentDeleteActionResult> {
  return runDeleteAction("student_account", async () => {
    const ownerProfileId = await requireOwnerProfileId();
    const studentId = requiredId(studentProfileId, "student_profile_id");
    const supabase = await createSupabaseServerClient();

    const { data: student, error: studentError } = await supabase
      .from("profiles")
      .select("id,auth_user_id,app_role,display_name,owner_profile_id")
      .eq("id", studentId)
      .eq("app_role", "student")
      .maybeSingle();
    if (studentError) throw studentError;
    if (!student) throw new Error("Student not found.");

    const ownerCanManage = student.owner_profile_id === ownerProfileId || (await hasManagedStudentLink(ownerProfileId, studentId));
    if (!ownerCanManage) throw new Error("Student is not managed by this owner.");

    const attemptCount = await countAttempts(supabase, "assignee_profile_id", studentId);
    if (attemptCount > 0) {
      await auditStudentAction("student.delete_blocked", "profiles", studentId, {
        reason: "attempt_history_exists",
        attempts: attemptCount,
        display_name: student.display_name,
      });
      throw new Error("This student has attempt history. Keep the account so exam records, uploads, marks, and receipts remain intact.");
    }

    await auditStudentAction("student.delete_requested", "profiles", studentId, {
      display_name: student.display_name,
    });

    await deleteAuthUserIfConfigured(student.auth_user_id);

    const { error: profileDeleteError } = await supabase
      .from("profiles")
      .delete()
      .eq("id", studentId)
      .eq("app_role", "student");
    if (profileDeleteError) throw profileDeleteError;

    await auditStudentAction("student.deleted", "profiles", studentId, {
      display_name: student.display_name,
    });

    revalidatePath("/owner/students");
    revalidatePath("/owner/cohorts");
    revalidatePath("/owner/analytics");
  });
}

export async function deleteRosterEntryAction(rosterEntryId: string): Promise<StudentDeleteActionResult> {
  return runDeleteAction("roster_entry", async () => {
    const ownerProfileId = await requireOwnerProfileId();
    const entryId = requiredId(rosterEntryId, "roster_entry_id");
    const supabase = await createSupabaseServerClient();

    const { data: entry, error: entryError } = await supabase
      .from("student_roster_entries")
      .select("id,owner_profile_id,student_number,display_name")
      .eq("id", entryId)
      .maybeSingle();
    if (entryError) throw entryError;
    if (!entry) throw new Error("Roster entry not found.");
    if (entry.owner_profile_id !== ownerProfileId) throw new Error("Roster entry is not managed by this owner.");

    const attemptCount = await countAttempts(supabase, "roster_entry_id", entryId);
    if (attemptCount > 0) {
      await auditStudentAction("roster_entry.delete_blocked", "student_roster_entries", entryId, {
        reason: "attempt_history_exists",
        attempts: attemptCount,
        student_number: entry.student_number,
        display_name: entry.display_name,
      });
      throw new Error("This roster number is linked to exam attempts. Keep it so guest exam identity and receipts remain traceable.");
    }

    await auditStudentAction("roster_entry.delete_requested", "student_roster_entries", entryId, {
      student_number: entry.student_number,
      display_name: entry.display_name,
    });

    const { error: deleteError } = await supabase
      .from("student_roster_entries")
      .delete()
      .eq("id", entryId)
      .eq("owner_profile_id", ownerProfileId);
    if (deleteError) throw deleteError;

    await auditStudentAction("roster_entry.deleted", "student_roster_entries", entryId, {
      student_number: entry.student_number,
      display_name: entry.display_name,
    });

    revalidatePath("/owner/students");
    revalidatePath("/owner/exam-sessions");
  });
}

function requiredString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function requiredId(value: string, key: string) {
  const id = String(value ?? "").trim();
  if (!id) throw new Error(`${key} is required`);
  return id;
}

async function hasManagedStudentLink(ownerProfileId: string, studentProfileId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("owner_student_links")
    .select("id")
    .eq("owner_profile_id", ownerProfileId)
    .eq("student_profile_id", studentProfileId)
    .eq("link_type", "managed_student")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function countAttempts(client: SupabaseDataClient, column: "assignee_profile_id" | "roster_entry_id", value: string) {
  const { count, error } = await client
    .from("attempts")
    .select("id", { count: "exact", head: true })
    .eq(column, value);
  if (error) throw error;
  return count ?? 0;
}

async function auditStudentAction(action: string, targetTable: string, targetId: string, metadata: Record<string, unknown>) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("audit_owner_action", {
    action,
    target_table: targetTable,
    target_id: targetId,
    metadata_json: asJson(metadata),
  });
  if (error) throw error;
}

async function deleteAuthUserIfConfigured(authUserId: string) {
  try {
    const admin = getSupabaseAdminClient();
    const { error } = await admin.auth.admin.deleteUser(authUserId);
    if (error) console.warn("Student auth user cleanup failed", error);
  } catch (error) {
    console.warn("Student auth user cleanup skipped; Supabase admin access is not configured", error);
  }
}

async function runDeleteAction(kind: "student_account" | "roster_entry", operation: () => Promise<void>): Promise<StudentDeleteActionResult> {
  try {
    await operation();
    return { ok: true };
  } catch (error) {
    console.error(`Owner ${kind} delete action failed`, error);
    return { ok: false, message: deleteActionMessage(kind, error) };
  }
}

function deleteActionMessage(kind: "student_account" | "roster_entry", error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (
    message.includes("attempt history") ||
    message.includes("not found") ||
    message.includes("not managed by this owner")
  ) {
    return message;
  }
  return kind === "student_account"
    ? "The student account could not be deleted. No exam records were removed."
    : "The roster number could not be deleted. No exam records were removed.";
}
