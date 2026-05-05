"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

export function ActivationForm() {
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/activate-student", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    const data = await response.json();
    setMessage(data.message ?? data.error ?? "Activation request sent.");
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
