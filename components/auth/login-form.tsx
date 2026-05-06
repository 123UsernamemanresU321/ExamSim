"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { postLoginRedirectForRole } from "@/lib/auth/routing";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type LoginFormProps = {
  nextPath?: string | null;
};

export function LoginForm({ nextPath }: LoginFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("Checking credentials...");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      if (error) {
        setMessage(error.message);
        return;
      }
      if (!signInData.user) {
        setMessage("Signed in, but Supabase did not return a user session.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("app_role")
        .eq("auth_user_id", signInData.user.id)
        .single();

      if (profileError || !profile) {
        setMessage("Signed in, but no Exam Vault profile was found for this account.");
        return;
      }

      setMessage("Signed in. Opening your workspace...");
      router.replace(postLoginRedirectForRole(profile.app_role, nextPath));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login is unavailable.");
    }
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <Field label="Email or student alias">
        <Input name="email" type="email" autoComplete="username" required />
      </Field>
      <Field label="Password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit">
        <LogIn size={16} aria-hidden="true" />
        Log in
      </Button>
      {message ? <p className="text-sm text-[var(--muted)]" role="status">{message}</p> : null}
    </form>
  );
}
