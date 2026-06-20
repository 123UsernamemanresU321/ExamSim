import { updateAssessmentGradingPolicyAction } from "@/app/owner/marking-queue/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import type { AssessmentGradingPolicy } from "@/types/database";

export function GradingPolicyPanel({ assessmentId, policy }: { assessmentId: string; policy: AssessmentGradingPolicy | null }) {
  return (
    <Card className="md:col-span-3">
      <h2 className="text-lg font-semibold text-[var(--ink)]">Collaborative grading policy</h2>
      <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Choose whether markers see identities, whether two independent submissions are required, and whether reviewer approval gates release.</p>
      <form action={updateAssessmentGradingPolicyAction.bind(null, assessmentId)} className="mt-5 grid gap-4 md:grid-cols-4 md:items-end">
        <label className="flex min-h-10 items-center gap-2 rounded-[3px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-sm font-semibold text-[var(--ink)]" title="Hides student names in marking queues and workspaces; attempt IDs remain available for audit.">
          <input type="checkbox" name="anonymous_grading" defaultChecked={policy?.anonymous_grading ?? false} /> Anonymous grading
        </label>
        <label className="flex min-h-10 items-center gap-2 rounded-[3px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-sm font-semibold text-[var(--ink)]" title="Requires a second marker submission from a different account before moderation can finish.">
          <input type="checkbox" name="double_marking" defaultChecked={policy?.double_marking ?? false} /> Double marking
        </label>
        <label className="flex min-h-10 items-center gap-2 rounded-[3px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-sm font-semibold text-[var(--ink)]" title="Requires reviewer approval before feedback can be released.">
          <input type="checkbox" name="moderation_required" defaultChecked={policy?.moderation_required ?? false} /> Moderation required
        </label>
        <Field label="Delta threshold" tooltip="If independent totals differ by more than this value, the attempt enters adjudication.">
          <Input name="double_mark_delta_threshold" type="number" min={0} max={100} step="0.5" defaultValue={policy?.double_mark_delta_threshold ?? 2} />
        </Field>
        <Button type="submit" className="md:col-span-4 md:justify-self-start">Save grading policy</Button>
      </form>
    </Card>
  );
}
