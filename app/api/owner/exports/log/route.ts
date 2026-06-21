import { NextResponse } from "next/server";
import { getInstitutionPermissionContext } from "@/lib/examsim/institution-roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const EXPORT_KINDS = new Set(["markbook_csv", "roster_csv", "cohort_csv", "assessment_inventory_json", "analytics_json"]);

export async function POST(request: Request) {
  const context = await getInstitutionPermissionContext();
  if (!context) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!context.permissions.includes("exports")) return NextResponse.json({ error: "Export permission required" }, { status: 403 });
  let body: { export_kind?: unknown; format?: unknown; row_count?: unknown; warnings?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const exportKind = typeof body.export_kind === "string" ? body.export_kind : "";
  if (!EXPORT_KINDS.has(exportKind)) return NextResponse.json({ error: "Unsupported export kind" }, { status: 400 });
  const format = typeof body.format === "string" && ["CSV", "JSON"].includes(body.format) ? body.format : "";
  if (!format) return NextResponse.json({ error: "Unsupported export format" }, { status: 400 });
  const rowCount = typeof body.row_count === "number" && Number.isInteger(body.row_count) && body.row_count >= 0 ? Math.min(body.row_count, 1_000_000) : null;
  const warnings = Array.isArray(body.warnings) ? body.warnings.filter((warning): warning is string => typeof warning === "string").map((warning) => warning.slice(0, 500)).slice(0, 20) : [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("export_download_history").insert({ owner_profile_id: context.ownerProfileId, actor_profile_id: context.profileId, export_kind: exportKind, format, row_count: rowCount, status: warnings.length ? "review_required" : "completed", fidelity_warnings_json: warnings, metadata_json: { delivery: "client_generated_owner_scoped" } }).select("id").single();
  if (error) return NextResponse.json({ error: "Could not record export history" }, { status: 500 });
  return NextResponse.json({ ok: true, history_id: data.id }, { headers: { "Cache-Control": "private, no-store" } });
}
