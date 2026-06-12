"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { isAppRole, normalizeLoginIdentifier } from "@/lib/auth/login-identifier";
import { postLoginRedirectForRole } from "@/lib/auth/routing";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AppRole } from "@/lib/constants";

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
      await supabase.auth.signOut({ scope: "local" });
      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email: normalizeLoginIdentifier(String(form.get("email") ?? "")),
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

      let role: AppRole | null = null;
      const metadataRole = signInData.user.app_metadata?.app_role;
      if (isAppRole(metadataRole)) {
        role = metadataRole;
      } else {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("app_role")
          .eq("auth_user_id", signInData.user.id)
          .single();

        if (profileError || !profile) {
          setMessage("Signed in, but no Exam Vault profile was found for this account.");
          return;
        }
        role = profile.app_role;
      }

      setMessage("Signed in. Opening your workspace...");
      router.replace(postLoginRedirectForRole(role, nextPath));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login is unavailable.");
    }
  }

  return (
    <form className="grid gap-5" onSubmit={onSubmit}>
      <Field
        label="Credentials"
        description="Owners sign in using their registered email. Students sign in using their issued login code (e.g., STU-XXXX)."
      >
        <Input
          name="email"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="owner@example.com or STU-XXXX"
          required
        />
      </Field>
      <Field label="Security Password">
        <Input 
          name="password" 
          type="password" 
          autoComplete="current-password" 
          required 
          placeholder="••••••••••••"
        />
      </Field>
      <Button type="submit" className="w-full justify-center gap-2.5 shadow-sm">
        <LogIn size={16} aria-hidden="true" />
        Authenticate Account
      </Button>
      {message ? (
        <div className="rounded-md bg-[var(--surface-muted)] px-3 py-2 border border-[var(--border)] text-xs text-[var(--muted)]" role="status">
          <p className="font-semibold">{message}</p>
        </div>
      ) : null}
    </form>
  );
}
