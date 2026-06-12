import { NextResponse } from "next/server";
import { requireAppRole } from "@/lib/auth/server";
import { getDestructiveActionPreview } from "@/lib/owner-operations";

const TARGETS = new Set(["assessment", "attempt", "question_bank_item"]);

export async function GET(request: Request) {
  await requireAppRole("owner", "/owner");
  const url = new URL(request.url);
  const targetKind = url.searchParams.get("target_kind") ?? "";
  const targetId = url.searchParams.get("target_id") ?? "";
  if (!TARGETS.has(targetKind) || !targetId) {
    return NextResponse.json({ error: "target_kind and target_id are required" }, { status: 400 });
  }
  const preview = await getDestructiveActionPreview(targetKind as "assessment" | "attempt" | "question_bank_item", targetId);
  return NextResponse.json(preview);
}
