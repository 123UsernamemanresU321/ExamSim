import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload?.attempt_id || !payload?.event_type) {
    return NextResponse.json({ error: "Invalid telemetry payload" }, { status: 400 });
  }

  // In production the browser calls the Supabase Edge Function directly or through
  // this route with the user's session. The MVP route prevents local demo crashes.
  return NextResponse.json({ accepted: true });
}
