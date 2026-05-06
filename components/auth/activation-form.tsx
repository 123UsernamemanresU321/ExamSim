"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ActivationForm() {
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.functions.invoke<{ message?: string; error?: string }>("activate-student", {
      body: Object.fromEntries(form),
    });
    setMessage(error?.message ?? data?.message ?? data?.error ?? "Activation request sent.");
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <Field label="Login code" description="Paste the exact login code issued by the owner.">
        <Input name="login_code" autoComplete="username" required />
      </Field>
      <Field label="Activation code" description="Paste is supported; no inaccessible split-code fields.">
        <Input name="activation_code" autoComplete="one-time-code" required />
      </Field>
      <Field label="New password">
        <Input name="new_password" type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <Button type="submit">
        <KeyRound size={16} aria-hidden="true" />
        Activate account
      </Button>
      {message ? <p className="text-sm text-[var(--muted)]" role="status">{message}</p> : null}
    </form>
  );
}
