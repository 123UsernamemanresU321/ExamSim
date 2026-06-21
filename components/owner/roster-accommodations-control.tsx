import { updateRosterAccommodationsAction } from "@/app/owner/students/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { parseRosterAccommodationPolicy } from "@/lib/examsim/accommodations";
import type { Json } from "@/types/database";

export function RosterAccommodationsControl({
  rosterEntryId,
  value,
}: {
  rosterEntryId: string;
  value: Json;
}) {
  const policy = parseRosterAccommodationPolicy(value);
  const activeCount = [
    policy.extra_time_percent > 0,
    policy.upload_extension_minutes > 0,
    policy.rest_break_allowed,
    policy.font_scale_percent > 100,
    policy.dyslexia_font,
    policy.contrast_mode === "high",
    policy.calculator_policy !== "none",
    policy.formula_booklet_allowed,
    policy.allowed_materials.length > 0,
    Boolean(policy.access_open_at_utc || policy.access_close_at_utc),
  ].filter(Boolean).length;

  return (
    <details className="min-w-[210px] rounded-[4px] border border-[var(--border)] bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-[var(--ink)] [&::-webkit-details-marker]:hidden">
        Accommodations
        <Badge tone={activeCount ? "info" : "neutral"}>{activeCount ? `${activeCount} active` : "standard"}</Badge>
      </summary>
      <form action={updateRosterAccommodationsAction} className="grid min-w-[300px] gap-3 border-t border-[var(--border)] p-3">
        <input type="hidden" name="roster_entry_id" value={rosterEntryId} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Extra time (%)" tooltip="Adds this percentage to the server-controlled writing time and upload deadline.">
            <Input name="extra_time_percent" type="number" min="0" max="200" defaultValue={policy.extra_time_percent} />
          </Field>
          <Field label="Upload extension" tooltip="Extra upload-only minutes added after the normal deadline.">
            <Input name="upload_extension_minutes" type="number" min="0" max="240" defaultValue={policy.upload_extension_minutes} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--ink)]">
          <input name="rest_break_allowed" type="checkbox" defaultChecked={policy.rest_break_allowed} />
          Approved rest breaks may pause the server timer
        </label>
        <Field label="Maximum rest break (minutes)" tooltip="Caps a single approved break. The owner or invigilator must still start and resume it.">
          <Input name="rest_break_max_minutes" type="number" min="0" max="240" defaultValue={policy.rest_break_max_minutes} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Text size" tooltip="Applies an accessible text scale in the exam workspace.">
            <Select name="font_scale_percent" defaultValue={String(policy.font_scale_percent)}>
              <option value="100">Standard</option>
              <option value="125">Large (125%)</option>
              <option value="150">Extra large (150%)</option>
            </Select>
          </Field>
          <Field label="Contrast" tooltip="Uses the standard or high-contrast exam workspace palette.">
            <Select name="contrast_mode" defaultValue={policy.contrast_mode}>
              <option value="standard">Standard</option>
              <option value="high">High contrast</option>
            </Select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--ink)]">
          <input name="dyslexia_font" type="checkbox" defaultChecked={policy.dyslexia_font} />
          Use the readable-font accommodation
        </label>
        <Field label="Calculator policy" tooltip="Controls which calculator tier the exam may expose for this student.">
          <Select name="calculator_policy" defaultValue={policy.calculator_policy}>
            <option value="none">Not allowed</option>
            <option value="basic">Basic</option>
            <option value="scientific">Scientific</option>
            <option value="graphing">Graphing (only when configured)</option>
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--ink)]">
          <input name="formula_booklet_allowed" type="checkbox" defaultChecked={policy.formula_booklet_allowed} />
          Formula booklet allowed
        </label>
        <Field label="Allowed materials" tooltip="One student-specific material per line. Session rules still apply.">
          <Textarea name="allowed_materials" defaultValue={policy.allowed_materials.join("\n")} placeholder="Bilingual dictionary\nApproved data booklet" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Access opens" tooltip="Optional student-specific access start. It can narrow, but never bypass, the session window.">
            <Input name="access_open_at_utc" type="datetime-local" defaultValue={toLocalInput(policy.access_open_at_utc)} />
          </Field>
          <Field label="Access closes" tooltip="Optional student-specific final entry time. Students outside this window are blocked server-side.">
            <Input name="access_close_at_utc" type="datetime-local" defaultValue={toLocalInput(policy.access_close_at_utc)} />
          </Field>
        </div>
        <p className="text-xs leading-5 text-[var(--muted)]">
          Browser read-aloud and built-in subject tools are enabled at session level. These student-specific settings never weaken exam timing or upload checks.
        </p>
        <Button type="submit" variant="secondary">Save accommodations</Button>
      </form>
    </details>
  );
}

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
