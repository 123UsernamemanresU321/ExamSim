import { createPaperModeJobAction } from "@/app/owner/paper-mode/actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataList, DataListMeta, DataListRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { listSessionAssessmentOptions } from "@/lib/examsim/session-data";
import { requireInstitutionPageAnyPermission } from "@/lib/examsim/institution-roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function PaperModePage() {
  const context = await requireInstitutionPageAnyPermission(["assessment_authoring", "marking"], "/owner/paper-mode");
  const canCreate = context.permissions.includes("assessment_authoring");
  const [options, jobsResult] = await Promise.all([
    canCreate ? listSessionAssessmentOptions() : Promise.resolve([]),
    (await createSupabaseServerClient()).from("paper_mode_jobs").select("*").eq("owner_profile_id", context.ownerProfileId).order("created_at", { ascending: false }),
  ]);
  if (jobsResult.error) throw jobsResult.error;
  return (
    <main className="space-y-6">
      <PageHeader eyebrow="Run" title="Paper Mode" description="Print personalized booklets, upload private scans, manually map uncertain pages, and mark the resulting attempts digitally." />
      <div className="border-y border-[var(--border)] bg-white px-5 py-4 text-sm leading-6 text-[var(--muted)]">Automatic barcode/OCR mapping is provider-gated. Manual identifiers and mapping remain the production-safe path and every mapping decision is auditable.</div>
      <div className="grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
        {canCreate ? <Card>
          <SectionHeader title="Create Paper Mode job" />
          <form action={createPaperModeJobAction} className="mt-4 grid gap-4">
            <Field label="Assessment version"><Select name="assessment_version_selection" required defaultValue=""><option value="">Select approved version</option>{options.map((option) => option.latestVersion ? <option key={option.latestVersion.id} value={`${option.assessment.id}|${option.latestVersion.id}`}>{option.assessment.title} · v{option.latestVersion.version_no}</option> : null)}</Select></Field>
            <Field label="Job title"><Input name="title" placeholder="May mock paper collection" /></Field>
            <Field label="Duration minutes"><Input name="duration_minutes" type="number" min="1" max="720" defaultValue="90" /></Field>
            <Field label="Printed instructions"><Textarea name="instructions" placeholder="Materials, return instructions, and room notes" /></Field>
            <Button type="submit">Create job</Button>
          </form>
        </Card> : null}
        <Card>
          <SectionHeader title="Paper Mode jobs" />
          {jobsResult.data?.length ? <DataList className="mt-4">{jobsResult.data.map((job) => <DataListRow key={job.id} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><p className="font-semibold text-[var(--ink)]">{job.title}</p><DataListMeta><span>{job.status.replaceAll("_", " ")}</span><span>{Math.round(job.duration_seconds / 60)} min</span><span>{new Date(job.created_at).toLocaleDateString()}</span></DataListMeta></div><ButtonLink href={`/owner/paper-mode/${job.id}`} variant="secondary">Open</ButtonLink></DataListRow>)}</DataList> : <EmptyState title="No Paper Mode jobs" description="Create a job from an approved assessment version." />}
        </Card>
      </div>
    </main>
  );
}
