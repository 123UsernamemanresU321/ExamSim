"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { StudentSummary } from "@/lib/live-data";

export function PublishAssessmentForm({
  assessmentId,
  versionId,
  students,
}: {
  assessmentId: string;
  versionId: string;
  students: StudentSummary[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("Publishing assessment...");
    const form = new FormData(event.currentTarget);
    const assignedProfileIds = form.getAll("assigned_profile_ids").map(String);

    const body = {
      assessment_id: assessmentId,
      version_id: versionId,
      start_at_local: String(form.get("start_at_local")),
      display_timezone: String(form.get("display_timezone") || DEFAULT_TIMEZONE),
      duration_seconds: Number(form.get("duration_seconds") || 7200),
      delivery_mode: String(form.get("delivery_mode") || "browser"),
      solutions_requested: form.get("solutions_requested") === "on",
      upload_only_grace_seconds: Number(form.get("upload_only_grace_seconds") || 0),
      assigned_profile_ids: assignedProfileIds,
      typed_enabled: form.get("typed_enabled") === "on",
      per_question_upload_enabled: form.get("per_question_upload_enabled") === "on",
      require_blank_for_skipped: form.get("require_blank_for_skipped") === "on",
    };

    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.functions.invoke<{ attempt_ids: string[] }>("publish-assessment", {
      body,
    });
    setIsSubmitting(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(`Published and created ${data?.attempt_ids.length ?? 0} attempt(s).`);
    router.refresh();
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <Field label="Start time in Africa/Johannesburg">
        <Input name="start_at_local" type="datetime-local" required />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Duration seconds">
          <Input name="duration_seconds" type="number" defaultValue={7200} min={1} required />
        </Field>
        <Field label="Upload grace seconds">
          <Input name="upload_only_grace_seconds" type="number" defaultValue={1800} min={0} />
        </Field>
        <Field label="Display timezone">
          <Input name="display_timezone" defaultValue={DEFAULT_TIMEZONE} required />
        </Field>
        <Field label="Delivery mode">
          <select name="delivery_mode" className="min-h-11 rounded-md border border-[var(--border)] bg-white px-3">
            <option value="browser">browser</option>
            <option value="seb_required">seb_required</option>
          </select>
        </Field>
      </div>
      <div className="grid gap-2 rounded-md border border-[var(--border)] bg-white p-3 text-sm">
        <label className="flex items-center gap-3">
          <input name="solutions_requested" type="checkbox" defaultChecked />
          Solutions/upload period requested
        </label>
        <label className="flex items-center gap-3">
          <input name="typed_enabled" type="checkbox" defaultChecked />
          Typed responses enabled
        </label>
        <label className="flex items-center gap-3">
          <input name="per_question_upload_enabled" type="checkbox" defaultChecked />
          Per-question PDF uploads enabled
        </label>
        <label className="flex items-center gap-3">
          <input name="require_blank_for_skipped" type="checkbox" />
          Require blank placeholders for skipped uploads
        </label>
      </div>
      <Field label="Assign students">
        <div className="grid gap-2">
          {students.length === 0 ? (
            <p className="rounded-md border border-[var(--border)] bg-white p-3 text-sm text-[var(--muted)]">
              No students yet. Create a student before publishing.
            </p>
          ) : (
            students.map((student) => (
              <label key={student.id} className="flex items-center gap-3 rounded-md border border-[var(--border)] bg-white p-3">
                <input name="assigned_profile_ids" type="checkbox" value={student.id} />
                <span>{student.display_name}</span>
              </label>
            ))
          )}
        </div>
      </Field>
      <Button type="submit" disabled={isSubmitting || students.length === 0}>
        Publish immutable version
      </Button>
      {message ? <p className="text-sm text-[var(--muted)]" role="status">{message}</p> : null}
    </form>
  );
}
