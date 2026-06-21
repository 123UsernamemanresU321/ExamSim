import { Target } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataList, DataListMeta, DataListRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAppRole } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function StudentRevisionPage() {
  await requireAppRole("student", "/student/revision");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("student_revision_assignments_safe", {});
  if (error) throw error;
  const groups = new Map<string, typeof data>();
  for (const row of data ?? []) groups.set(row.revision_set_id, [...(groups.get(row.revision_set_id) ?? []), row]);
  return <main className="space-y-6"><SectionHeading title="Suggested revision" description="These practice sets were reviewed and assigned by your teacher from released results. Draft or unreleased marking evidence is never shown here." />{groups.size ? <div className="grid gap-5">{[...groups.values()].map((rows) => { const first = rows[0]!; return <Card key={first.revision_set_id}><div className="flex items-start gap-3"><span className="grid size-9 place-items-center rounded-[4px] bg-[var(--surface-muted)] text-[var(--primary)]"><Target size={18} /></span><div><h2 className="font-semibold text-[var(--ink)]">{first.set_title}</h2><p className="mt-1 text-sm text-[var(--muted)]">{first.rationale ?? "Teacher-assigned practice"}</p></div></div><DataList className="mt-4">{rows.map((row) => <DataListRow key={row.item_id}><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-[var(--ink)]">{row.question_title ?? `Practice question ${row.ordinal + 1}`}</p><Badge tone={row.priority === "high" ? "danger" : "warning"}>{row.priority}</Badge></div><p className="mt-1 text-sm text-[var(--muted)]">{row.reason}</p><div className="mt-3 whitespace-pre-wrap rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm leading-6 text-[var(--ink)]">{stripHtml(row.prompt_html) || row.prompt_latex || "Open the source question with your teacher."}</div><DataListMeta><span>{row.marks_available ?? 0} marks</span><span>{row.answer_mode.replaceAll("_", " ")}</span><span>{row.tags.join(", ") || "Practice"}</span></DataListMeta></DataListRow>)}</DataList></Card>; })}</div> : <EmptyState title="No revision set assigned" description="Your teacher can assign practice after marked feedback is released." />}</main>;
}

function stripHtml(value: string | null) { return (value ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim(); }
