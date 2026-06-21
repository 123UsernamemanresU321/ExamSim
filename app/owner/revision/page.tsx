import { generateRevisionSetAction } from "@/app/owner/revision/actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataList, DataListMeta, DataListRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/form";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { requireInstitutionPagePermission } from "@/lib/examsim/institution-roles";
import { listOwnerStudents } from "@/lib/live-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function RevisionSetsPage() {
  const context = await requireInstitutionPagePermission("analytics", "/owner/revision");
  const [students, setsResult] = await Promise.all([listOwnerStudents(), (await createSupabaseServerClient()).from("revision_sets").select("*").eq("owner_profile_id", context.ownerProfileId).order("created_at", { ascending: false })]);
  if (setsResult.error) throw setsResult.error;
  const studentById = new Map(students.map((student) => [student.id, student.display_name]));
  return <main className="space-y-6"><PageHeader eyebrow="Review" title="Adaptive revision" description="Build teacher-reviewed practice sets from released topic, standard, and mark-loss evidence. Suggestions never auto-assign or expose unreleased work." /><div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]"><Card><SectionHeader title="Generate a draft" description="Only students with linked results accounts and released marking evidence can receive a revision set." /><form action={generateRevisionSetAction} className="mt-4 grid gap-4"><Field label="Student account"><Select name="student_profile_id" required defaultValue=""><option value="">Select student</option>{students.map((student) => <option key={student.id} value={student.id}>{student.display_name}</option>)}</Select></Field><Field label="Set title"><Input name="title" placeholder="Mechanics recovery set" /></Field><Field label="Question count"><Input name="question_count" type="number" min="3" max="20" defaultValue="8" /></Field><Button type="submit">Generate review draft</Button></form></Card><Card><SectionHeader title="Revision sets" />{setsResult.data?.length ? <DataList className="mt-4">{setsResult.data.map((set) => <DataListRow key={set.id} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><p className="font-semibold text-[var(--ink)]">{set.title}</p><DataListMeta><span>{studentById.get(set.student_profile_id) ?? "Linked student"}</span><span>{set.status}</span><span>{new Date(set.created_at).toLocaleDateString()}</span></DataListMeta></div><ButtonLink href={`/owner/revision/${set.id}`} variant="secondary">Review</ButtonLink></DataListRow>)}</DataList> : <EmptyState title="No revision sets" description="Generate a set after feedback has been released and Question Library items have reviewed topic or standard tags." />}</Card></div></main>;
}
