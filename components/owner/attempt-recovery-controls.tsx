"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Plus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";

export function AttemptRecoveryControls({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function logIncident(formData: FormData) {
    setBusy("incident");
    try {
      const supabase = createSupabaseBrowserClient();
      await invokeEdgeFunction(supabase, "attempt-intervention", {
        body: {
          action: "log_incident",
          attempt_id: attemptId,
          incident_type: String(formData.get("incident_type") ?? "other"),
          severity: String(formData.get("severity") ?? "low"),
          description: String(formData.get("description") ?? ""),
          affects_marking: formData.get("affects_marking") === "on",
        },
        requiresAal2: true,
      });
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not log incident.");
    } finally {
      setBusy(null);
    }
  }

  async function grantExtension(formData: FormData) {
    setBusy("extension");
    try {
      const supabase = createSupabaseBrowserClient();
      await invokeEdgeFunction(supabase, "attempt-recovery", {
        body: {
          action: "grant_upload_extension",
          attempt_id: attemptId,
          extra_seconds: Number(formData.get("extra_seconds") ?? 600),
          reason: String(formData.get("reason") ?? ""),
        },
        requiresAal2: true,
      });
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not grant extension.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4">
      <form action={logIncident} className="rounded-xl border border-[var(--border)] bg-white p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-[var(--ink)]">
          <Plus size={15} /> Log incident
        </h3>
        <div className="grid gap-3">
          <Field label="Type">
            <select name="incident_type" className="min-h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm">
              <option value="internet_issue">Internet issue</option>
              <option value="power_cut">Power cut</option>
              <option value="wrong_upload">Wrong upload</option>
              <option value="medical">Medical</option>
              <option value="browser_crash">Browser crash</option>
              <option value="admin_note">Admin note</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Severity">
            <select name="severity" className="min-h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm">
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </Field>
          <Field label="Description">
            <Textarea name="description" required placeholder="What happened? Keep this factual." />
          </Field>
          <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <input name="affects_marking" type="checkbox" />
            Affects marking
          </label>
          <Button type="submit" className="gap-2 text-white" disabled={busy === "incident"}>
            <Wrench size={14} />
            Save incident
          </Button>
        </div>
      </form>

      <form action={grantExtension} className="rounded-xl border border-[var(--border)] bg-white p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-[var(--ink)]">
          <Clock size={15} /> Upload extension
        </h3>
        <div className="grid gap-3">
          <Field label="Extra seconds">
            <Input name="extra_seconds" type="number" min={1} defaultValue={600} />
          </Field>
          <Field label="Reason">
            <Textarea name="reason" required placeholder="Reason for controlled extension." />
          </Field>
          <Button type="submit" className="gap-2 text-white" disabled={busy === "extension"}>
            Grant extension
          </Button>
        </div>
      </form>
    </div>
  );
}
