"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import type { StudentGroupSummary, StudentSummary } from "@/lib/live-data";

export function PublishAssessmentForm({
  assessmentId,
  versionId,
  students,
  groups,
}: {
  assessmentId: string;
  versionId: string;
  students: StudentSummary[];
  groups: StudentGroupSummary[];
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
    const assignedGroupIds = form.getAll("assigned_group_ids").map(String);
    const sebConfigFile = form.get("seb_config_file") as File | null;

    const supabase = createSupabaseBrowserClient();
    let sebConfigPath: string | null = null;
    const deliveryMode = String(form.get("delivery_mode") || "browser");
    const browserExamKeys = splitHashes(String(form.get("seb_browser_exam_key_hashes") ?? ""));
    const configKeys = splitHashes(String(form.get("seb_config_key_hashes") ?? ""));

    if (deliveryMode === "seb_required") {
      const invalidKey = [...browserExamKeys, ...configKeys].find((key) => !/^[a-f0-9]{64}$/i.test(key));
      if (browserExamKeys.length === 0 || configKeys.length === 0 || invalidKey) {
        setMessage("SEB-required attempts need at least one 64-character Browser Exam Key and one 64-character Config Key copied after saving the final .seb file.");
        setIsSubmitting(false);
        return;
      }
    }

    if (sebConfigFile && sebConfigFile.size > 0) {
      if (sebConfigFile.size > 1024 * 1024) {
        setMessage("SEB configuration upload failed: .seb files must be 1MB or smaller.");
        setIsSubmitting(false);
        return;
      }
      try {
        const uploadData = await invokeEdgeFunction<{ seb_config_path: string }>(supabase, "upload-seb-config", {
          body: {
            assessment_id: assessmentId,
            version_id: versionId,
            file_name: sebConfigFile.name,
            content_base64: await fileToBase64(sebConfigFile),
          },
          requiresAal2: true,
        });
        sebConfigPath = uploadData?.seb_config_path ?? null;
      } catch (error) {
        setMessage(error instanceof Error ? `SEB config upload failed: ${error.message}` : "SEB config upload failed.");
        setIsSubmitting(false);
        return;
      }
    }

    const body = {
      assessment_id: assessmentId,
      version_id: versionId,
      start_at_local: String(form.get("start_at_local")),
      display_timezone: String(form.get("display_timezone") || DEFAULT_TIMEZONE),
      duration_seconds: Number(form.get("duration_seconds") || 7200),
      delivery_mode: deliveryMode,
      solutions_requested: form.get("solutions_requested") === "on",
      upload_only_grace_seconds: Number(form.get("upload_only_grace_seconds") || 0),
      assigned_profile_ids: assignedProfileIds,
      typed_enabled: form.get("typed_enabled") === "on",
      per_question_upload_enabled: form.get("per_question_upload_enabled") === "on",
      require_blank_for_skipped: form.get("require_blank_for_skipped") === "on",
      assigned_group_ids: assignedGroupIds,
      seb_browser_exam_key_hashes: browserExamKeys,
      seb_config_key_hashes: configKeys,
      seb_config_path: sebConfigPath,
    };

    try {
      const data = await invokeEdgeFunction<{ attempt_ids: string[] }>(supabase, "publish-assessment", {
        body,
        requiresAal2: true,
      });
      setMessage(`Published and created ${data?.attempt_ids.length ?? 0} attempt(s).`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not publish assessment.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <Field
        label="Start time in Africa/Johannesburg"
        description="The local scheduled start. The Edge Function converts this to UTC and all attempt state decisions are recalculated server-side."
      >
        <Input name="start_at_local" type="datetime-local" required />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Duration seconds" description="Writing time only, in seconds. The browser countdown is display-only; Supabase Edge Functions enforce the real end time.">
          <Input name="duration_seconds" type="number" defaultValue={7200} min={1} required />
        </Field>
        <Field label="Upload grace seconds" description="Extra upload-only time after writing ends when solutions are requested. Writing is disabled during this state.">
          <Input name="upload_only_grace_seconds" type="number" defaultValue={1800} min={0} />
        </Field>
        <Field label="Display timezone" description="Timezone shown to users. Stored attempt timestamps remain UTC internally.">
          <Input name="display_timezone" defaultValue={DEFAULT_TIMEZONE} required />
        </Field>
        <Field label="Delivery mode" description="Browser mode is tamper-evident. SEB-required mode blocks package release unless server-verified SEB Browser Exam Key and Config Key request hashes match.">
          <select name="delivery_mode" className="min-h-11 rounded-md border border-[var(--border)] bg-white px-3">
            <option value="browser">browser</option>
            <option value="seb_required">seb_required</option>
          </select>
        </Field>
        <Field label="Browser Exam Key" description="Required for SEB attempts. Copy the 64-character Browser Exam Key from Safe Exam Browser only after the final .seb configuration is saved.">
          <Input name="seb_browser_exam_key_hashes" placeholder="64-character hex key; comma or line separated for multiple SEB versions" />
        </Field>
        <Field label="Config Key" description="Required for SEB attempts. Copy the 64-character Config Key after saving the final .seb file. The server validates URL-specific request hashes, not user-agent strings.">
          <Input name="seb_config_key_hashes" placeholder="64-character hex key; comma or line separated" />
        </Field>
        <Field label="SEB Configuration File (.seb)" description="Optional. Uploaded through an owner MFA-gated Edge Function into private Storage so students can download the exact configuration from their dashboard.">
          <input name="seb_config_file" type="file" accept=".seb" className="flex h-11 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm" />
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
      <Field label="Assign students" description="Each selected student receives a separate attempt. Group assignment expands to one attempt per current group member.">
        <div className="grid gap-2">
          {students.length === 0 && groups.length === 0 ? (
            <p className="rounded-md border border-[var(--border)] bg-white p-3 text-sm text-[var(--muted)]">
              No students or groups yet. Create a student or group before publishing.
            </p>
          ) : (
            <>
              {students.map((student) => (
                <label key={student.id} className="flex items-center gap-3 rounded-md border border-[var(--border)] bg-white p-3">
                  <input name="assigned_profile_ids" type="checkbox" value={student.id} />
                  <span>{student.display_name}</span>
                </label>
              ))}
              {groups.map((group) => (
                <label key={group.id} className="flex items-center gap-3 rounded-md border border-[var(--border)] bg-white p-3">
                  <input name="assigned_group_ids" type="checkbox" value={group.id} />
                  <span>{group.name} group · {group.member_count} member(s)</span>
                </label>
              ))}
            </>
          )}
        </div>
      </Field>
      <Button type="submit" disabled={isSubmitting || (students.length === 0 && groups.length === 0)}>
        Publish immutable version
      </Button>
      {message ? <p className="text-sm text-[var(--muted)]" role="status">{message}</p> : null}
    </form>
  );
}

function splitHashes(value: string) {
  return value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}
