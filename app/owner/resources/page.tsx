import { ResourceLibraryManager } from "@/components/owner/resource-library-manager";
import { SectionHeading } from "@/components/section-heading";
import { requireInstitutionPagePermission } from "@/lib/examsim/institution-roles";
import { isDemoModeEnabled } from "@/lib/runtime";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ResourceLibraryItem } from "@/types/database";

export default async function OwnerResourcesPage() {
  const context = await requireInstitutionPagePermission("assessment_authoring", "/owner/resources");
  const demoMode = isDemoModeEnabled();
  let resources: ResourceLibraryItem[] = [];
  const usageCounts: Record<string, number> = {};

  if (!demoMode) {
    const supabase = await createSupabaseServerClient();
    const [{ data: resourceRows, error: resourceError }, { data: assignments, error: assignmentError }] = await Promise.all([
      supabase.from("resource_library_items").select("*").eq("owner_profile_id", context.ownerProfileId).order("created_at", { ascending: false }),
      supabase.from("assessment_materials").select("resource_library_item_id").not("resource_library_item_id", "is", null),
    ]);
    if (resourceError) throw resourceError;
    if (assignmentError) throw assignmentError;
    resources = (resourceRows ?? []) as ResourceLibraryItem[];
    for (const assignment of assignments ?? []) {
      if (!assignment.resource_library_item_id) continue;
      usageCounts[assignment.resource_library_item_id] = (usageCounts[assignment.resource_library_item_id] ?? 0) + 1;
    }
  }

  return (
    <main className="space-y-6">
      <SectionHeading title="Resource Library" description="Private, reusable formula booklets, data booklets, annexes, instructions, and reference PDFs. Nothing here is public or directly readable by students." />
      <ResourceLibraryManager resources={resources} usageCounts={usageCounts} />
    </main>
  );
}
