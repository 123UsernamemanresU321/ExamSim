import "server-only";

import { asJson } from "@/lib/owner-operations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function auditInstitutionAction({
  ownerProfileId,
  action,
  targetTable,
  targetId = null,
  metadata = {},
}: {
  ownerProfileId: string;
  action: string;
  targetTable: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("audit_institution_action", {
    p_owner_profile_id: ownerProfileId,
    p_action: action,
    p_target_table: targetTable,
    p_target_id: targetId,
    p_metadata_json: asJson(metadata),
  });
  if (error) throw error;
}
