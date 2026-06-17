"use server";

import { revalidatePath } from "next/cache";
import { buildStudentNumber, normalizeStudentNumber } from "@/lib/examsim/guest-access";
import { requireOwnerProfileId } from "@/lib/examsim/session-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

function requiredString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}
