"use client";

import { useState } from "react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm() {
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("Checking credentials...");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      if (error) setMessage(error.message);
      else setMessage("Signed in. Route guards will direct you to your workspace.");
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
