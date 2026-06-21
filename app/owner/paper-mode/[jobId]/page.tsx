import { notFound } from "next/navigation";
import { generatePaperModeBookletsAction, mapPaperScanPageAction, rejectPaperScanPageAction } from "@/app/owner/paper-mode/[jobId]/actions";
import { PaperScanOpenButton, PaperScanUploadPanel } from "@/components/owner/paper-scan-upload-panel";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataList, DataListMeta, DataListRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/form";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { requireInstitutionPageAnyPermission } from "@/lib/examsim/institution-roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PaperModeBooklet, PaperModeScan, PaperModeScanPage, QuestionNodeRow } from "@/types/database";

export default async function PaperModeJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const context = await requireInstitutionPageAnyPermission(["assessment_authoring", "marking"], `/owner/paper-mode/${jobId}`);
  const canGenerate = context.permissions.includes("assessment_authoring");
  const canMap = context.permissions.includes("marking");
  const supabase = await createSupabaseServerClient();
  const { data: job, error: jobError } = await supabase.from("paper_mode_jobs").select("*,assessments(title,paper_code,subject),assessment_versions(version_no,status)").eq("id", jobId).eq("owner_profile_id", context.ownerProfileId).maybeSingle();
  if (jobError) throw jobError;
  if (!job) notFound();
  const [{ data: bookletRows, error: bookletError }, { data: scanRows, error: scanError }, { data: questionRows, error: questionError }] = await Promise.all([
    supabase.from("paper_mode_booklets").select("*").eq("paper_mode_job_id", job.id).order("student_number_snapshot"),
    supabase.from("paper_mode_scans").select("*").eq("paper_mode_job_id", job.id).order("created_at", { ascending: false }),
    supabase.from("question_nodes").select("*").eq("assessment_version_id", job.assessment_version_id).in("node_type", ["question", "subquestion", "part"]).order("ordinal_path"),
  ]);
  if (bookletError) throw bookletError;
  if (scanError) throw scanError;
  if (questionError) throw questionError;
  const booklets = (bookletRows ?? []) as PaperModeBooklet[];
  const scans = (scanRows ?? []) as PaperModeScan[];
  const scanIds = scans.map((scan) => scan.id);
  const { data: pageRows, error: pageError } = scanIds.length
    ? await supabase.from("paper_mode_scan_pages").select("*").in("paper_mode_scan_id", scanIds).order("page_number")
    : { data: [], error: null };
  if (pageError) throw pageError;
  const pages = (pageRows ?? []) as PaperModeScanPage[];
  const questions = (questionRows ?? []) as QuestionNodeRow[];
  const assessment = Array.isArray(job.assessments) ? job.assessments[0] : job.assessments;
  const version = Array.isArray(job.assessment_versions) ? job.assessment_versions[0] : job.assessment_versions;
  const mappedCount = pages.filter((page) => page.mapping_status === "mapped").length;
  const outstandingCount = pages.filter((page) => page.mapping_status === "unmapped" || page.mapping_status === "needs_review").length;

  return (
    <main className="space-y-6 pb-12">
      <PageHeader eyebrow="Paper Mode" title={job.title} description={`${assessment?.title ?? "Assessment"} · version ${version?.version_no ?? "?"} · ${Math.round(job.duration_seconds / 60)} minutes`} actions={<ButtonLink href="/owner/paper-mode" variant="secondary">All Paper Mode jobs</ButtonLink>} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="Job state" value={job.status.replaceAll("_", " ")} />
        <Summary label="Booklets" value={String(booklets.length)} />
        <Summary label="Mapped pages" value={`${mappedCount}/${pages.length}`} />
        <Summary label="Needs mapping" value={String(outstandingCount)} warning={outstandingCount > 0} />
      </div>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <SectionHeader title="Personalized booklets" description="Each active roster student receives a stable booklet identity and a finished paper attempt that appears in the marking queue." />
          <div className="mt-4 flex flex-wrap gap-2">
            {canGenerate ? <form action={generatePaperModeBookletsAction}><input type="hidden" name="paper_mode_job_id" value={job.id} /><Button type="submit">Generate or refresh roster booklets</Button></form> : null}
            {booklets.length ? <ButtonLink href={`/api/owner/paper-mode/${job.id}/booklet`} target="_blank" variant="secondary">Download printable booklet pack</ButtonLink> : null}
          </div>
          {booklets.length ? <DataList className="mt-4">{booklets.map((booklet) => <DataListRow key={booklet.id} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><p className="font-semibold text-[var(--ink)]">{booklet.student_name_snapshot}</p><DataListMeta><span>{booklet.student_number_snapshot ?? "No student number"}</span><span className="font-mono">{booklet.booklet_code}</span></DataListMeta></div>{booklet.attempt_id ? <ButtonLink href={`/owner/attempts/${booklet.attempt_id}/mark`} variant="secondary">Mark attempt</ButtonLink> : null}</DataListRow>)}</DataList> : <div className="mt-4"><EmptyState title="No booklets generated" description="Generate booklets from the active student roster. Existing booklet identities are preserved if you run generation again." /></div>}
        </Card>
        <Card>
          <SectionHeader title="Upload collected scans" description="Scans stay in private Storage. The server verifies PDF bytes before page records are created." />
          <div className="mt-4">{canMap ? <PaperScanUploadPanel jobId={job.id} /> : <p className="text-sm text-[var(--muted)]">Marking permission is required to upload scans.</p>}</div>
        </Card>
      </section>

      <Card>
        <SectionHeader title="Manual mapping queue" description="Automatic scan mapping is not configured. Review each page and use manual mapping to connect it to the correct booklet attempt and question." />
        {!scans.length ? <div className="mt-4"><EmptyState title="No scans uploaded" description="Upload a collected PDF scan to create the manual mapping queue." /></div> : <div className="mt-5 space-y-5">{scans.map((scan) => {
          const scanPages = pages.filter((page) => page.paper_mode_scan_id === scan.id);
          return <section key={scan.id} className="border-t border-[var(--border)] pt-4 first:border-t-0 first:pt-0"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-[var(--ink)]">{scan.original_file_name ?? "Paper scan"}</h3><DataListMeta><span>{scanPages.length} page{scanPages.length === 1 ? "" : "s"}</span><span>{Math.round(scan.file_size_bytes / 1024)} KB</span><Badge tone={scan.status === "mapped" ? "success" : scan.status === "partially_mapped" ? "warning" : "neutral"}>{scan.status.replaceAll("_", " ")}</Badge></DataListMeta></div><PaperScanOpenButton objectPath={scan.object_path} /></div><div className="mt-3 grid gap-3">{scanPages.map((page) => <div key={page.id} className="grid gap-3 rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-3 lg:grid-cols-[110px_minmax(0,1fr)]"><div><p className="font-semibold text-[var(--ink)]">Page {page.page_number}</p><Badge tone={page.mapping_status === "mapped" ? "success" : page.mapping_status === "rejected" ? "danger" : "warning"}>{page.mapping_status.replaceAll("_", " ")}</Badge><div className="mt-2"><PaperScanOpenButton objectPath={scan.object_path} pageNumber={page.page_number} /></div></div>{canMap ? <form action={mapPaperScanPageAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(180px,0.8fr)_auto]"><input type="hidden" name="paper_mode_job_id" value={job.id} /><input type="hidden" name="scan_page_id" value={page.id} /><Field label="Student booklet"><Select name="booklet_id" required defaultValue={page.booklet_id ?? ""}><option value="">Select student</option>{booklets.map((booklet) => <option key={booklet.id} value={booklet.id}>{booklet.student_number_snapshot ?? "No number"} · {booklet.student_name_snapshot}</option>)}</Select></Field><Field label="Question"><Select name="question_node_id" required defaultValue={page.question_node_id ?? ""}><option value="">Select question</option>{questions.map((question) => <option key={question.id} value={question.id}>{question.display_label ?? question.node_key} · {question.marks ?? 0} marks</option>)}</Select></Field><Field label="Mapping note"><Input name="notes" defaultValue={page.notes ?? ""} placeholder="Optional page note" /></Field><div className="flex items-end gap-2"><Button type="submit">Save mapping</Button><Button type="submit" variant="dangerSubtle" formAction={rejectPaperScanPageAction}>Reject</Button></div></form> : <p className="text-sm text-[var(--muted)]">Marking permission is required to map this page.</p>}</div>)}</div></section>;
        })}</div>}
      </Card>
    </main>
  );
}

function Summary({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className="border-y border-[var(--border)] bg-white px-4 py-3"><p className="text-xs font-semibold uppercase text-[var(--subtle)]">{label}</p><p className={`mt-1 text-xl font-bold capitalize ${warning ? "text-[var(--danger)]" : "text-[var(--ink)]"}`}>{value}</p></div>;
}
