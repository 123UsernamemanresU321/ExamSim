import { notFound } from "next/navigation";
import { assignRevisionSetAction, removeRevisionSetItemAction } from "@/app/owner/revision/actions";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataList, DataListMeta, DataListRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { requireInstitutionPagePermission } from "@/lib/examsim/institution-roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function RevisionSetPage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params;
  const context = await requireInstitutionPagePermission("analytics", `/owner/revision/${setId}`);
  const supabase = await createSupabaseServerClient();
  const { data: set, error: setError } = await supabase.from("revision_sets").select("*").eq("id", setId).eq("owner_profile_id", context.ownerProfileId).maybeSingle();
  if (setError) throw setError;
  if (!set) notFound();
  const [{ data: student }, { data: items, error: itemError }] = await Promise.all([supabase.from("profiles").select("display_name").eq("id", set.student_profile_id).maybeSingle(), supabase.from("revision_set_items").select("*,question_bank_items(title,root_node_key,prompt_html,marks_available,tags,readiness_status)").eq("revision_set_id", set.id).order("ordinal")]);
  if (itemError) throw itemError;
  return <main className="space-y-6"><PageHeader eyebrow="Adaptive revision" title={set.title} description={`${student?.display_name ?? "Student"} · ${set.status}`} actions={<ButtonLink href="/owner/revision" variant="secondary">All revision sets</ButtonLink>} /><Card><SectionHeader title="Teacher review" description="Remove unsuitable suggestions before assignment. Assigned sets are frozen so the student's practice list cannot change silently." /><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{set.rationale ?? "No rationale recorded."}</p>{items?.length ? <DataList className="mt-4">{items.map((item) => { const question = Array.isArray(item.question_bank_items) ? item.question_bank_items[0] : item.question_bank_items; return <DataListRow key={item.id} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-[var(--ink)]">{question?.title ?? question?.root_node_key ?? "Question"}</p><Badge tone={item.priority === "high" ? "danger" : "warning"}>{item.priority}</Badge></div><p className="mt-1 text-sm text-[var(--muted)]">{item.reason}</p><DataListMeta><span>{question?.marks_available ?? 0} marks</span><span>{(question?.tags ?? []).join(", ") || "No tags"}</span></DataListMeta></div>{set.status === "draft" ? <form action={removeRevisionSetItemAction}><input type="hidden" name="revision_set_id" value={set.id} /><input type="hidden" name="revision_set_item_id" value={item.id} /><Button type="submit" variant="dangerSubtle">Remove</Button></form> : <Badge tone="success">Assigned</Badge>}</DataListRow>; })}</DataList> : <EmptyState title="No suggested questions remain" description="Return to the revision list and generate a new draft after adding reviewed Question Library tags." />}{set.status === "draft" && items?.length ? <form action={assignRevisionSetAction} className="mt-5 border-t border-[var(--border)] pt-4"><input type="hidden" name="revision_set_id" value={set.id} /><Button type="submit">Approve and assign to student</Button></form> : null}</Card></main>;
}
