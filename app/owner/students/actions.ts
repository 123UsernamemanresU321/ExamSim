"use server";

import { revalidatePath } from "next/cache";
import { buildStudentNumber, normalizeStudentNumber } from "@/lib/examsim/guest-access";
import { auditInstitutionAction } from "@/lib/examsim/institution-audit";
import { requireInstitutionPermission } from "@/lib/examsim/institution-roles";
import { asJson } from "@/lib/owner-operations";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StudentDeleteActionResult = { ok: true } | { ok: false; message: string };
export type StudentRosterLinkActionResult = { ok: true; message: string } | { ok: false; message: string };
type SupabaseDataClient = Pick<Awaited<ReturnType<typeof createSupabaseServerClient>>, "from">;

export async function createRosterEntryAction(formData: FormData) {
  const { ownerProfileId } = await requireInstitutionPermission("student_management");
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
  const { ownerProfileId } = await requireInstitutionPermission("student_management");
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

export async function updateRosterAccommodationsAction(formData: FormData) {
  const { ownerProfileId } = await requireInstitutionPermission("student_management");
  const rosterEntryId = requiredId(String(formData.get("roster_entry_id") ?? ""), "roster_entry_id");
  const extra_time_percent = clampInteger(Number(formData.get("extra_time_percent") ?? 0), 0, 200);
  const upload_extension_minutes = clampInteger(Number(formData.get("upload_extension_minutes") ?? 0), 0, 240);
  const rest_break_max_minutes = clampInteger(Number(formData.get("rest_break_max_minutes") ?? 0), 0, 240);
  const fontScale = clampInteger(Number(formData.get("font_scale_percent") ?? 100), 100, 150);
  const font_scale_percent = [100, 125, 150].includes(fontScale) ? fontScale : 100;
  const contrastValue = String(formData.get("contrast_mode") ?? "standard");
  const contrast_mode = contrastValue === "high" ? "high" : "standard";
  const calculatorValue = String(formData.get("calculator_policy") ?? "none");
  const calculator_policy = ["none", "basic", "scientific", "graphing"].includes(calculatorValue)
    ? calculatorValue
    : "none";
  const allowed_materials = String(formData.get("allowed_materials") ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 20);
  const access_open_at_utc = optionalIso(formData.get("access_open_at_utc"));
  const access_close_at_utc = optionalIso(formData.get("access_close_at_utc"));
  if (access_open_at_utc && access_close_at_utc && Date.parse(access_close_at_utc) <= Date.parse(access_open_at_utc)) {
    throw new Error("The student access close time must be after the open time.");
  }
  const accommodations = {
    extra_time_percent,
    upload_extension_minutes,
    rest_break_allowed: formData.get("rest_break_allowed") === "on",
    rest_break_max_minutes,
    font_scale_percent,
    dyslexia_font: formData.get("dyslexia_font") === "on",
    contrast_mode,
    calculator_policy,
    formula_booklet_allowed: formData.get("formula_booklet_allowed") === "on",
    allowed_materials,
    access_open_at_utc,
    access_close_at_utc,
  };
  const supabase = await createSupabaseServerClient();
  const { data: entry, error: entryError } = await supabase
    .from("student_roster_entries")
    .select("id,owner_profile_id,student_number")
    .eq("id", rosterEntryId)
    .maybeSingle();
  if (entryError) throw entryError;
  if (!entry || entry.owner_profile_id !== ownerProfileId) throw new Error("Roster entry is not managed by this owner.");
  const { error } = await supabase
    .from("student_roster_entries")
    .update({ accommodations_json: asJson(accommodations) })
    .eq("id", rosterEntryId)
    .eq("owner_profile_id", ownerProfileId);
  if (error) throw error;
  await auditStudentAction(ownerProfileId, "roster_entry.accommodations_updated", "student_roster_entries", rosterEntryId, {
    student_number: entry.student_number,
    policy: accommodations,
  });
  revalidatePath("/owner/students");
  revalidatePath("/owner/exam-sessions");
}

export async function deleteStudentAccountAction(studentProfileId: string): Promise<StudentDeleteActionResult> {
  return runDeleteAction("student_account", async () => {
    const { ownerProfileId } = await requireInstitutionPermission("student_management");
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
      await auditStudentAction(ownerProfileId, "student.delete_blocked", "profiles", studentId, {
        reason: "attempt_history_exists",
        attempts: attemptCount,
        display_name: student.display_name,
      });
      throw new Error("This student has attempt history. Keep the account so exam records, uploads, marks, and receipts remain intact.");
    }

    await auditStudentAction(ownerProfileId, "student.delete_requested", "profiles", studentId, {
      display_name: student.display_name,
    });

    await deleteAuthUserOrThrow(student.auth_user_id);

    const { error: profileDeleteError } = await supabase
      .from("profiles")
      .delete()
      .eq("id", studentId)
      .eq("app_role", "student");
    if (profileDeleteError) throw profileDeleteError;

    await auditStudentAction(ownerProfileId, "student.deleted", "profiles", studentId, {
      display_name: student.display_name,
    });

    revalidatePath("/owner/students");
    revalidatePath("/owner/cohorts");
    revalidatePath("/owner/analytics");
  });
}

export async function deleteRosterEntryAction(rosterEntryId: string): Promise<StudentDeleteActionResult> {
  return runDeleteAction("roster_entry", async () => {
    const { ownerProfileId } = await requireInstitutionPermission("student_management");
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
      await auditStudentAction(ownerProfileId, "roster_entry.delete_blocked", "student_roster_entries", entryId, {
        reason: "attempt_history_exists",
        attempts: attemptCount,
        student_number: entry.student_number,
        display_name: entry.display_name,
      });
      throw new Error("This roster number is linked to exam attempts. Keep it so guest exam identity and receipts remain traceable.");
    }

    await auditStudentAction(ownerProfileId, "roster_entry.delete_requested", "student_roster_entries", entryId, {
      student_number: entry.student_number,
      display_name: entry.display_name,
    });

    const { error: deleteError } = await supabase
      .from("student_roster_entries")
      .delete()
      .eq("id", entryId)
      .eq("owner_profile_id", ownerProfileId);
    if (deleteError) throw deleteError;

    await auditStudentAction(ownerProfileId, "roster_entry.deleted", "student_roster_entries", entryId, {
      student_number: entry.student_number,
      display_name: entry.display_name,
    });

    revalidatePath("/owner/students");
    revalidatePath("/owner/exam-sessions");
  });
}

export async function linkRosterEntryToStudentAccountAction(formData: FormData): Promise<StudentRosterLinkActionResult> {
  return runRosterLinkAction(async () => {
    const { ownerProfileId } = await requireInstitutionPermission("student_management");
    const entryId = requiredId(String(formData.get("roster_entry_id") ?? ""), "roster_entry_id");
    const requestedStudentId = String(formData.get("student_profile_id") ?? "").trim();
    const nextStudentId = requestedStudentId || null;
    const supabase = await createSupabaseServerClient();

    const { data: entry, error: entryError } = await supabase
      .from("student_roster_entries")
      .select("id,owner_profile_id,student_number,display_name,student_profile_id")
      .eq("id", entryId)
      .maybeSingle();
    if (entryError) throw entryError;
    if (!entry) throw new Error("Roster entry not found.");
    if (entry.owner_profile_id !== ownerProfileId) throw new Error("Roster entry is not managed by this owner.");

    let linkedStudentName: string | null = null;
    if (nextStudentId) {
      const { data: student, error: studentError } = await supabase
        .from("profiles")
        .select("id,owner_profile_id,app_role,display_name")
        .eq("id", nextStudentId)
        .eq("app_role", "student")
        .maybeSingle();
      if (studentError) throw studentError;
      if (!student) throw new Error("Student account not found.");
      const ownerCanManage =
        student.owner_profile_id === ownerProfileId || (await hasManagedStudentLink(ownerProfileId, nextStudentId));
      if (!ownerCanManage) throw new Error("Student account is not managed by this owner.");
      linkedStudentName = student.display_name;
    }

    const { error: updateError } = await supabase
      .from("student_roster_entries")
      .update({ student_profile_id: nextStudentId })
      .eq("id", entryId)
      .eq("owner_profile_id", ownerProfileId);
    if (updateError) throw updateError;

    await auditStudentAction(
      ownerProfileId,
      nextStudentId ? "roster_entry.account_linked" : "roster_entry.account_unlinked",
      "student_roster_entries",
      entryId,
      {
        student_number: entry.student_number,
        roster_display_name: entry.display_name,
        previous_student_profile_id: entry.student_profile_id,
        student_profile_id: nextStudentId,
        student_display_name: linkedStudentName,
      },
    );

    revalidatePath("/owner/students");
    revalidatePath("/owner/exam-sessions");
    return nextStudentId
      ? `Linked ${entry.student_number} to ${linkedStudentName ?? "the selected student account"}.`
      : `Unlinked ${entry.student_number} from its student account.`;
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

function optionalIso(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) throw new Error("Invalid accommodation access time.");
  return parsed.toISOString();
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

async function auditStudentAction(ownerProfileId: string, action: string, targetTable: string, targetId: string, metadata: Record<string, unknown>) {
  await auditInstitutionAction({ ownerProfileId, action, targetTable, targetId, metadata });
}

async function deleteAuthUserOrThrow(authUserId: string) {
  let admin: ReturnType<typeof getSupabaseAdminClient>;
  try {
    admin = getSupabaseAdminClient();
  } catch {
    throw new Error("Student account deletion is not configured on this deployment. Set SUPABASE_SERVICE_ROLE_KEY on the server. No profile was removed.");
  }
  const { error } = await admin.auth.admin.deleteUser(authUserId);
  if (error) {
    console.error("Student Supabase Auth deletion failed", error);
    throw new Error("Supabase Auth could not delete this student account. No profile was removed.");
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
    message.includes("not managed by this owner") ||
    message.includes("No profile was removed")
  ) {
    return message;
  }
  return kind === "student_account"
    ? "The student account could not be deleted. No exam records were removed."
    : "The roster number could not be deleted. No exam records were removed.";
}

async function runRosterLinkAction(operation: () => Promise<string>): Promise<StudentRosterLinkActionResult> {
  try {
    const message = await operation();
    return { ok: true, message };
  } catch (error) {
    console.error("Owner roster-account link action failed", error);
    return { ok: false, message: rosterLinkActionMessage(error) };
  }
}

function rosterLinkActionMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (
    message.includes("not found") ||
    message.includes("not managed by this owner")
  ) {
    return message;
  }
  return "The roster number could not be linked to that student account. No exam records were changed.";
}
