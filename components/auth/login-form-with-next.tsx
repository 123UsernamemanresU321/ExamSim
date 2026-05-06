"use client";

import { useSearchParams } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";

export function LoginFormWithNext() {
  const searchParams = useSearchParams();
  return <LoginForm nextPath={searchParams.get("next")} />;
}
