import { AlertTriangle, BookOpenCheck, Calculator, ExternalLink, ShieldCheck, Volume2 } from "lucide-react";
import { saveAssessmentExamPolicyAction } from "@/app/owner/assessments/[id]/settings/actions";
import { SectionHeading } from "@/components/section-heading";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select, Textarea } from "@/components/ui/form";
import { requireInstitutionPagePermission } from "@/lib/examsim/institution-roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AssessmentMaterial, AssessmentToolPolicy, ResourceLibraryItem } from "@/types/database";

export default async function AssessmentSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const context = await requireInstitutionPagePermission("assessment_authoring", `/owner/assessments/${id}/settings`);
  const supabase = await createSupabaseServerClient();
  const { data: assessment, error: assessmentError } = await supabase
    .from("assessments")
    .select("id,title,subject,owner_profile_id")
    .eq("id", id)
    .eq("owner_profile_id", context.ownerProfileId)
    .maybeSingle();
  if (assessmentError) throw assessmentError;
  if (!assessment) return <SectionHeading title="Assessment not found" description="This assessment is outside the current institution workspace." />;

  const requestedVersionId = typeof query.version === "string" ? query.version : null;
  let versionQuery = supabase.from("assessment_versions").select("*").eq("assessment_id", id);
  if (requestedVersionId) versionQuery = versionQuery.eq("id", requestedVersionId);
  const { data: versions, error: versionError } = await versionQuery.order("version_no", { ascending: false }).limit(1);
  if (versionError) throw versionError;
  const version = versions?.[0];
  if (!version) return <EmptyState title="No assessment version" description="Create or import a draft before configuring materials and tools." />;

  const [{ data: resources, error: resourcesError }, { data: materials, error: materialsError }, { data: toolPolicies, error: toolsError }] = await Promise.all([
    supabase.from("resource_library_items").select("*").eq("owner_profile_id", context.ownerProfileId).eq("status", "active").order("title"),
    supabase.from("assessment_materials").select("*").eq("assessment_version_id", version.id).order("sort_order"),
    supabase.from("assessment_tool_policies").select("*").eq("assessment_version_id", version.id),
  ]);
  if (resourcesError) throw resourcesError;
  if (materialsError) throw materialsError;
  if (toolsError) throw toolsError;
  const materialByResourceId = new Map((materials ?? []).filter((material) => material.resource_library_item_id).map((material) => [material.resource_library_item_id, material as AssessmentMaterial]));
  const toolByCode = new Map((toolPolicies ?? []).map((tool) => [tool.tool_code, tool as AssessmentToolPolicy]));
  const physicalCalculator = toolByCode.get("physical_calculator");
  const physicalMaterials = toolByCode.get("physical_materials");
  const calculatorClass = readConfigurationString(physicalCalculator?.configuration_json, "calculator_class") ?? "none";
  const materialItems = readConfigurationItems(physicalMaterials?.configuration_json);
  const published = version.status === "published" || version.governance_status === "published";
  const activeResources = (resources ?? []) as ResourceLibraryItem[];

  return (
    <main className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Assessments", href: "/owner/assessments" },
          { label: assessment.title, href: `/owner/assessments/${id}` },
          { label: "Settings" },
        ]}
      />
      <SectionHeading
        title="Materials and tools"
        description={`${assessment.title} · Version ${version.version_no}. This assessment-level policy is frozen into every attempt.`}
        actions={<div className="flex gap-2"><ButtonLink href="/owner/resources" variant="secondary"><BookOpenCheck size={15} aria-hidden="true" />Resource Library</ButtonLink><ButtonLink href={`/owner/assessments/${id}`} variant="secondary">Assessment</ButtonLink></div>}
      />
      {query.saved === "1" ? <div role="status" className="rounded-[4px] border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">Policy saved.{query.draft_created === "1" ? " The published version stayed frozen and a new draft was created." : ""}</div> : null}
      {published ? <div className="flex gap-3 rounded-[4px] border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" /><p><strong>Published policy is immutable.</strong> Saving changes here creates a new draft version; current sessions and attempts retain their existing snapshot.</p></div> : null}

      <form action={saveAssessmentExamPolicyAction.bind(null, id, version.id)} className="grid gap-6">
        <Card>
          <div className="mb-5 flex items-start gap-3"><BookOpenCheck className="mt-0.5 text-[var(--primary)]" size={19} aria-hidden="true" /><div><h2 className="font-semibold text-[var(--ink)]">Formula, data, and reference booklets</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">Required booklets are available in the waiting room and during the exam. Allowed booklets remain optional. Not assigned resources are not released.</p></div></div>
          {activeResources.length ? <div className="grid gap-3">
            {activeResources.map((resource) => {
              const assignment = materialByResourceId.get(resource.id);
              return <div key={resource.id} className="grid gap-3 rounded-[4px] border border-[var(--border)] p-4 lg:grid-cols-[minmax(0,1fr)_180px_180px] lg:items-end">
                <div><p className="font-semibold text-[var(--ink)]">{resource.title}</p><p className="mt-1 text-xs text-[var(--muted)]">{resource.material_type.replaceAll("_", " ")}{resource.subject ? ` · ${resource.subject}` : ""}{resource.version_label ? ` · ${resource.version_label}` : ""}</p></div>
                <Field label="Requirement"><Select name={`resource_requirement_${resource.id}`} defaultValue={assignment?.requirement ?? "prohibited"}><option value="prohibited">Not assigned</option><option value="allowed">Allowed</option><option value="required">Required</option></Select></Field>
                <Field label="Availability"><Select name={`resource_visibility_${resource.id}`} defaultValue={assignment?.visibility_policy ?? "before_exam"}><option value="before_exam">Waiting room and exam</option><option value="active_only">During exam only</option><option value="after_finish">After finish only</option><option value="always">Always</option></Select></Field>
              </div>;
            })}
          </div> : <EmptyState title="No active booklets" description="Upload authorized PDFs to the Resource Library first." action={<ButtonLink href="/owner/resources">Open Resource Library</ButtonLink>} />}
        </Card>

        <Card>
          <div className="mb-5 flex items-start gap-3"><Calculator className="mt-0.5 text-[var(--primary)]" size={19} aria-hidden="true" /><div><h2 className="font-semibold text-[var(--ink)]">Physical calculator and materials</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">A required GDC means every student must prepare an approved physical graphing calculator. Desmos is a separate browser-tool permission.</p></div></div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Physical calculator"><Select name="physical_calculator_class" defaultValue={calculatorClass}><option value="none">None</option><option value="basic">Basic</option><option value="scientific">Scientific</option><option value="gdc">Physical GDC</option></Select></Field>
            <Field label="Calculator requirement"><RequirementSelect name="tool_requirement_physical_calculator" value={physicalCalculator?.requirement ?? "prohibited"} /></Field>
            <Field label="Approved physical materials" description="One item per line, for example ruler or approved dictionary."><Textarea name="physical_materials_items" rows={4} defaultValue={materialItems.join("\n")} /></Field>
            <Field label="Material requirement"><RequirementSelect name="tool_requirement_physical_materials" value={physicalMaterials?.requirement ?? "prohibited"} /></Field>
          </div>
        </Card>

        <Card>
          <div className="mb-5 flex items-start gap-3"><Volume2 className="mt-0.5 text-[var(--primary)]" size={19} aria-hidden="true" /><div><h2 className="font-semibold text-[var(--ink)]">Built-in browser tools</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">These controls determine which integrated tools appear. TTS may be added as an individual accessibility exception; prohibited subject tools cannot.</p></div></div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ToolPolicyField label="Browser TTS" name="tool_requirement_tts" policy={toolByCode.get("tts")} detail="Uses the browser Web Speech API." />
            <ToolPolicyField label="Desmos" name="tool_requirement_desmos" policy={toolByCode.get("desmos")} detail="Separate from a physical GDC." />
            <ToolPolicyField label="GeoGebra geometry" name="tool_requirement_geogebra" policy={toolByCode.get("geogebra")} detail="Geometry workspace; CAS remains disabled." />
            <ToolPolicyField label="Ketcher chemistry" name="tool_requirement_chemistry_editor" policy={toolByCode.get("chemistry_editor")} detail="Self-hosted chemistry structure editor." />
          </div>
        </Card>

        <Card className="border-[var(--primary)]/30">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><div className="flex items-center gap-2"><ShieldCheck size={17} className="text-[var(--primary)]" aria-hidden="true" /><h2 className="font-semibold text-[var(--ink)]">Policy preview</h2><Badge tone={published ? "warning" : "info"}>{published ? "creates draft" : "editable draft"}</Badge></div><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">Sessions inherit this policy. They may prohibit an allowed item, but cannot remove a requirement or enable a prohibited subject tool. Attempts receive an immutable snapshot.</p></div>
            <Button type="submit">{published ? "Create draft and save policy" : "Save materials and tools"}<ExternalLink size={14} aria-hidden="true" /></Button>
          </div>
        </Card>
      </form>
    </main>
  );
}

function RequirementSelect({ name, value }: { name: string; value: string }) {
  return <Select name={name} defaultValue={value}><option value="prohibited">Not permitted</option><option value="allowed">Allowed</option><option value="required">Required</option></Select>;
}

function ToolPolicyField({ label, name, policy, detail }: { label: string; name: string; policy?: AssessmentToolPolicy; detail: string }) {
  return <Field label={label} description={detail}><RequirementSelect name={name} value={policy?.requirement ?? "prohibited"} /></Field>;
}

function readConfigurationString(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = (value as Record<string, unknown>)[key];
  return typeof result === "string" ? result : null;
}

function readConfigurationItems(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const items = (value as Record<string, unknown>).items;
  return Array.isArray(items) ? items.map(String) : [];
}
