"use server";

import { revalidatePath } from "next/cache";
import { auditInstitutionAction } from "@/lib/examsim/institution-audit";
import { requireInstitutionPermission } from "@/lib/examsim/institution-roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function archiveResourceLibraryItemAction(formData: FormData) {
  const resourceId = String(formData.get("resource_id") ?? "").trim();
  if (!resourceId) throw new Error("Resource is required.");
  const context = await requireInstitutionPermission("assessment_authoring");
  const supabase = await createSupabaseServerClient();
  const { data: resource, error: resourceError } = await supabase
    .from("resource_library_items")
    .select("id,status")
    .eq("id", resourceId)
    .eq("owner_profile_id", context.ownerProfileId)
    .maybeSingle();
  if (resourceError) throw resourceError;
  if (!resource) throw new Error("Resource is outside this institution.");
  if (resource.status !== "active") return;

  const { data: updated, error } = await supabase
    .from("resource_library_items")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", resourceId)
    .eq("owner_profile_id", context.ownerProfileId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!updated) throw new Error("Resource archive did not update the expected workspace row.");
  await auditInstitutionAction({
    ownerProfileId: context.ownerProfileId,
    action: "resource_library.archived",
    targetTable: "resource_library_items",
    targetId: resourceId,
  });
  revalidatePath("/owner/resources");
}
