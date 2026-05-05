import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const protectedPrefixes = ["/owner", "/student"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!protectedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const response = NextResponse.next({ request });
  if (process.env.NODE_ENV !== "production" && process.env.EXAM_VAULT_DEMO_MODE === "1") {
    response.headers.set("x-exam-vault-demo-mode", "explicit");
    return response;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    response.headers.set("x-exam-vault-demo-mode", "missing-supabase-env");
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const role = data.user?.app_metadata?.app_role;

  if (!data.user) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", pathname);
    return NextResponse.redirect(redirect);
  }

  if (pathname.startsWith("/owner") && role !== "owner") {
    return NextResponse.redirect(new URL("/student", request.url));
  }

  if (pathname.startsWith("/student") && role !== "student") {
    return NextResponse.redirect(new URL("/owner", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/owner/:path*", "/student/:path*"],
};
