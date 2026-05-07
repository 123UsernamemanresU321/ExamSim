"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import type { StudentSummary } from "@/lib/live-data";

export function CreateStudentGroupForm({ students }: { students: StudentSummary[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("Creating group...");
    const form = new FormData(event.currentTarget);
    const supabase = createSupabaseBrowserClient();
    try {
      const data = await invokeEdgeFunction<{ group_id: string; member_count: number }>(supabase, "create-student-group", {
        body: {
          name: String(form.get("name") ?? ""),
          description: String(form.get("description") ?? ""),
          student_profile_ids: form.getAll("student_profile_ids").map(String),
        },
        requiresAal2: true,
      });
      setMessage(`Group created with ${data?.member_count ?? 0} member(s).`);
      event.currentTarget.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create group.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <Field label="Group name">
        <Input name="name" placeholder="IB HL Practice Group" required />
      </Field>
      <Field label="Description">
        <Textarea name="description" placeholder="Optional notes for this group." />
      </Field>
      <Field label="Members">
        <div className="grid max-h-56 gap-2 overflow-auto rounded-md border border-[var(--border)] bg-white p-3">
          {students.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Create students before adding groups.</p>
          ) : (
            students.map((student) => (
              <label key={student.id} className="flex items-center gap-3 text-sm">
                <input name="student_profile_ids" type="checkbox" value={student.id} />
                {student.display_name}
              </label>
            ))
          )}
        </div>
      </Field>
      <Button type="submit" disabled={isSubmitting || students.length === 0}>
        <Users size={16} aria-hidden="true" />
        Create group
      </Button>
      {message ? <p className="text-sm text-[var(--muted)]" role="status">{message}</p> : null}
    </form>
  );
}
