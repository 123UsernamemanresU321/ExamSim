import { createCurriculumFrameworkAction, createCurriculumStandardAction, seedSampleStandardsAction } from "@/app/owner/standards/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { requireInstitutionContext } from "@/lib/examsim/institution-roles";
import { isDemoModeEnabled } from "@/lib/runtime";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CurriculumGuideReviewPanel } from "@/components/owner/curriculum-guide-review-panel";
import type { CurriculumFramework, CurriculumSourceDocument, CurriculumStandard } from "@/types/database";

export default async function StandardsPage() {
  const context = await requireInstitutionContext("/owner/standards");
  const canAuthor = context.permissions.includes("assessment_authoring");
  const demoMode = isDemoModeEnabled();
  let typedFrameworks: CurriculumFramework[] = [];
  let typedStandards: CurriculumStandard[] = [];
  let typedSources: CurriculumSourceDocument[] = [];

  if (!demoMode) {
    const supabase = await createSupabaseServerClient();
    const [{ data: frameworks, error: frameworkError }, { data: standards, error: standardError }, { data: sources, error: sourceError }] = await Promise.all([
      supabase.from("curriculum_frameworks").select("*").eq("owner_profile_id", context.ownerProfileId).order("code"),
      supabase.from("curriculum_standards").select("*").eq("owner_profile_id", context.ownerProfileId).order("sort_order").order("code"),
      supabase.from("curriculum_source_documents").select("*").eq("owner_profile_id", context.ownerProfileId).order("created_at", { ascending: false }),
    ]);
    if (frameworkError) throw frameworkError;
    if (standardError) throw standardError;
    if (sourceError) throw sourceError;
    typedFrameworks = (frameworks ?? []) as CurriculumFramework[];
    typedStandards = (standards ?? []) as CurriculumStandard[];
    typedSources = (sources ?? []) as CurriculumSourceDocument[];
  }

  return (
    <main className="space-y-6">
      <PageHeader eyebrow="Review" title="Curriculum standards" description="Manage versioned standards trees used by question authoring, rubrics, analytics, and revision recommendations." />
      <div className="border-y border-[var(--border)] bg-white px-5 py-4 text-sm leading-6 text-[var(--muted)]">
        Imported frameworks are school-reviewed, guide-version-specific content for this institution. The illustrative sample frameworks remain structural starters only and are de-emphasized until replaced or approved from an authorized guide.
      </div>

      {canAuthor ? <CurriculumGuideReviewPanel sources={typedSources} draftStandards={typedStandards.filter((standard) => standard.review_status === "draft" || standard.review_status === "reviewed")} frameworks={typedFrameworks} /> : null}

      {canAuthor ? (
        <section className="grid gap-5 xl:grid-cols-2" aria-label="Standards setup">
          <Card>
            <h2 className="text-base font-semibold text-[var(--ink)]">Seed sample frameworks</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Creates small IB, MYP, IGCSE, and Olympiad/SAMO starter trees for testing the workflow.</p>
            <form action={seedSampleStandardsAction} className="mt-4"><Button type="submit" variant="secondary">Seed sample frameworks</Button></form>
          </Card>
          <Card>
            <h2 className="text-base font-semibold text-[var(--ink)]">Create framework</h2>
            <form action={createCurriculumFrameworkAction} className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Code" tooltip="Short framework identifier, for example IB or SCHOOL-2027."><Input name="code" required placeholder="IB" /></Field>
              <Field label="Version" tooltip="The guide or local curriculum version this tree represents."><Input name="version" required placeholder="2027" /></Field>
              <Field label="Name" tooltip="Human-readable framework name." className="sm:col-span-2"><Input name="name" required placeholder="IB Diploma Programme 2027" /></Field>
              <Field label="Description" tooltip="Scope, source, and verification notes." className="sm:col-span-2"><Textarea name="description" /></Field>
              <Button type="submit" className="sm:col-span-2 sm:justify-self-start">Create framework</Button>
            </form>
          </Card>
        </section>
      ) : null}

      {typedFrameworks.length ? (
        <div className="grid gap-5 xl:grid-cols-2">
          {typedFrameworks.map((framework) => {
            const frameworkStandards = typedStandards.filter((standard) => standard.framework_id === framework.id && standard.review_status === "approved");
            const illustrative = framework.version.startsWith("sample-");
            return (
              <Card key={framework.id} className={illustrative ? "opacity-75" : undefined}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h2 className="text-base font-semibold text-[var(--ink)]">{framework.name}</h2><p className="mt-1 font-mono text-xs text-[var(--muted)]">{framework.code} · {framework.version}</p></div>
                  <div className="flex gap-2"><Badge tone={illustrative ? "neutral" : framework.review_status === "active" ? "success" : "warning"}>{illustrative ? "illustrative sample" : framework.review_status}</Badge><Badge tone="neutral">{frameworkStandards.length} approved</Badge></div>
                </div>
                {framework.description ? <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{framework.description}</p> : null}
                <div className="mt-4 divide-y divide-[var(--border)] border-y border-[var(--border)]">
                  {frameworkStandards.map((standard) => (
                    <div key={standard.id} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <div><p className="font-mono text-xs font-semibold text-[var(--primary)]">{standard.code}</p><p className="text-sm font-semibold text-[var(--ink)]">{standard.title}</p></div>
                      <p className="text-xs text-[var(--muted)]">{[standard.subject, standard.level].filter(Boolean).join(" · ") || "General"}</p>
                    </div>
                  ))}
                </div>
                {canAuthor ? (
                  <details className="mt-4 border-t border-[var(--border)] pt-4">
                    <summary className="cursor-pointer text-sm font-semibold text-[var(--primary)]">Add standard</summary>
                    <form action={createCurriculumStandardAction} className="mt-4 grid gap-3 sm:grid-cols-2">
                      <input type="hidden" name="framework_id" value={framework.id} />
                      <Field label="Code" tooltip="Stable unique code within this framework."><Input name="code" required /></Field>
                      <Field label="Title" tooltip="Teacher-facing standard title."><Input name="title" required /></Field>
                      <Field label="Subject" tooltip="Optional subject filter."><Input name="subject" /></Field>
                      <Field label="Level" tooltip="Optional level or grade."><Input name="level" /></Field>
                      <Field label="Node kind" tooltip="How this node is used in authoring and analytics."><Select name="standard_kind" defaultValue="topic"><option value="topic">Topic</option><option value="subtopic">Subtopic</option><option value="skill">Skill</option><option value="assessment_objective">Assessment objective</option><option value="command_term">Command term</option><option value="core_requirement">Core requirement</option></Select></Field>
                      <Field label="Parent" tooltip="Optional parent standard for a hierarchical tree." className="sm:col-span-2">
                        <Select name="parent_standard_id" defaultValue=""><option value="">Top level</option>{frameworkStandards.map((standard) => <option key={standard.id} value={standard.id}>{standard.code} · {standard.title}</option>)}</Select>
                      </Field>
                      <Button type="submit" variant="secondary" className="sm:col-span-2 sm:justify-self-start">Add standard</Button>
                    </form>
                  </details>
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : <EmptyState title="No standards trees" description="Create a framework or seed starter trees before attaching standards to questions and rubrics." />}
    </main>
  );
}
