import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.login_code || !body?.activation_code || !body?.new_password) {
    return NextResponse.json({ error: "Missing activation fields" }, { status: 400 });
  }

  return NextResponse.json({
    message:
      "Activation endpoint scaffolded. In production this proxies to the Supabase activate-student Edge Function.",
  });
}
