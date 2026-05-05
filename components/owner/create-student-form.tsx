"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type CreatedStudent = {
  login_code: string;
  activation_code: string;
};

export function CreateStudentForm() {
  const [created, setCreated] = useState<CreatedStudent | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("Creating student...");
    setCreated(null);

    const form = new FormData(event.currentTarget);
    const displayName = String(form.get("display_name") ?? "").trim();
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.functions.invoke<CreatedStudent>("create-student", {
      body: { display_name: displayName },
    });

    setIsSubmitting(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    setCreated(data ?? null);
    setMessage("Student created. Share these one-time activation details securely.");
    event.currentTarget.reset();
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <Field label="Display name">
        <Input name="display_name" placeholder="Student name" required />
      </Field>
      <Button type="submit" disabled={isSubmitting}>
        <UserPlus size={16} aria-hidden="true" />
        Generate login and activation code
      </Button>
      {message ? <p className="text-sm text-[var(--muted)]" role="status">{message}</p> : null}
      {created ? (
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm">
          <p className="font-semibold text-[var(--ink)]">Login code: {created.login_code}</p>
          <p className="mt-1 font-semibold text-[var(--ink)]">Activation code: {created.activation_code}</p>
          <p className="mt-2 text-[var(--muted)]">The activation code is not stored in plaintext.</p>
        </div>
      ) : null}
    </form>
  );
}
