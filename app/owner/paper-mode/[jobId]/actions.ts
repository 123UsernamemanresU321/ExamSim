"use server";

import { revalidatePath } from "next/cache";
import { auditInstitutionAction } from "@/lib/examsim/institution-audit";
import { requireInstitutionPermission } from "@/lib/examsim/institution-roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generatePaperModeBookletsAction(formData: FormData) {
  const jobId = requiredId(formData, "paper_mode_job_id");
  const { ownerProfileId } = await requireInstitutionPermission("assessment_authoring");
  const supabase = await createSupabaseServerClient();
  const job = await requireOwnedJob(supabase, jobId, ownerProfileId);
  const { data, error } = await supabase.rpc("institution_generate_paper_mode_booklets", { p_job_id: job.id });
  if (error) throw error;
  await auditInstitutionAction({
    ownerProfileId,
    action: "paper_mode.booklets_generated",
    targetTable: "paper_mode_jobs",
    targetId: job.id,
    metadata: { booklet_count: data?.length ?? 0 },
  });
  revalidatePath(`/owner/paper-mode/${job.id}`);
  revalidatePath("/owner/paper-mode");
}

export async function mapPaperScanPageAction(formData: FormData) {
  const jobId = requiredId(formData, "paper_mode_job_id");
  const pageId = requiredId(formData, "scan_page_id");
  const bookletId = requiredId(formData, "booklet_id");
  const questionNodeId = requiredId(formData, "question_node_id");
  const { ownerProfileId, profileId } = await requireInstitutionPermission("marking");
  const supabase = await createSupabaseServerClient();
  const job = await requireOwnedJob(supabase, jobId, ownerProfileId);
  const [{ data: page, error: pageError }, { data: booklet, error: bookletError }, { data: question, error: questionError }] = await Promise.all([
    supabase.from("paper_mode_scan_pages").select("id,paper_mode_scan_id,page_number").eq("id", pageId).maybeSingle(),
    supabase.from("paper_mode_booklets").select("id,attempt_id,paper_mode_job_id").eq("id", bookletId).eq("paper_mode_job_id", job.id).maybeSingle(),
    supabase.from("question_nodes").select("id,assessment_version_id").eq("id", questionNodeId).eq("assessment_version_id", job.assessment_version_id).maybeSingle(),
  ]);
  if (pageError) throw pageError;
  if (bookletError) throw bookletError;
  if (questionError) throw questionError;
  if (!page || !booklet?.attempt_id || !question) throw new Error("The selected scan page, booklet, attempt, or question is not available for this job.");
  const { data: scan, error: scanError } = await supabase.from("paper_mode_scans").select("id,paper_mode_job_id").eq("id", page.paper_mode_scan_id).eq("paper_mode_job_id", job.id).maybeSingle();
  if (scanError) throw scanError;
  if (!scan) throw new Error("The scan page does not belong to this Paper Mode job.");

  const { error: updateError } = await supabase.from("paper_mode_scan_pages").update({
    booklet_id: booklet.id,
    attempt_id: booklet.attempt_id,
    question_node_id: question.id,
    mapping_status: "mapped",
    mapping_confidence: 1,
    notes: optionalText(formData, "notes", 500),
    mapped_by_profile_id: profileId,
    mapped_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", page.id).eq("paper_mode_scan_id", scan.id);
  if (updateError) throw updateError;
  await refreshPaperModeStatuses(supabase, job.id, scan.id);
  await auditInstitutionAction({
    ownerProfileId,
    action: "paper_mode.scan_page_mapped",
    targetTable: "paper_mode_scan_pages",
    targetId: page.id,
    metadata: { paper_mode_job_id: job.id, scan_id: scan.id, page_number: page.page_number, booklet_id: booklet.id, attempt_id: booklet.attempt_id, question_node_id: question.id },
  });
  revalidatePath(`/owner/paper-mode/${job.id}`);
  revalidatePath(`/owner/attempts/${booklet.attempt_id}/mark`);
  revalidatePath("/owner/marking-queue");
}

export async function rejectPaperScanPageAction(formData: FormData) {
  const jobId = requiredId(formData, "paper_mode_job_id");
  const pageId = requiredId(formData, "scan_page_id");
  const { ownerProfileId, profileId } = await requireInstitutionPermission("marking");
  const supabase = await createSupabaseServerClient();
  const job = await requireOwnedJob(supabase, jobId, ownerProfileId);
  const { data: page, error: pageError } = await supabase.from("paper_mode_scan_pages").select("id,paper_mode_scan_id,page_number").eq("id", pageId).maybeSingle();
  if (pageError) throw pageError;
  if (!page) throw new Error("Scan page not found.");
  const { data: scan, error: scanError } = await supabase.from("paper_mode_scans").select("id").eq("id", page.paper_mode_scan_id).eq("paper_mode_job_id", job.id).maybeSingle();
  if (scanError) throw scanError;
  if (!scan) throw new Error("The scan page does not belong to this job.");
  const { error } = await supabase.from("paper_mode_scan_pages").update({
    booklet_id: null,
    attempt_id: null,
    question_node_id: null,
    mapping_status: "rejected",
    mapping_confidence: null,
    notes: optionalText(formData, "notes", 500) ?? "Rejected during manual review",
    mapped_by_profile_id: profileId,
    mapped_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", page.id).eq("paper_mode_scan_id", scan.id);
  if (error) throw error;
  await refreshPaperModeStatuses(supabase, job.id, scan.id);
  await auditInstitutionAction({ ownerProfileId, action: "paper_mode.scan_page_rejected", targetTable: "paper_mode_scan_pages", targetId: page.id, metadata: { paper_mode_job_id: job.id, page_number: page.page_number } });
  revalidatePath(`/owner/paper-mode/${job.id}`);
}

async function refreshPaperModeStatuses(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, jobId: string, scanId: string) {
  const { data: scanPages, error: pageError } = await supabase.from("paper_mode_scan_pages").select("mapping_status").eq("paper_mode_scan_id", scanId);
  if (pageError) throw pageError;
  const terminal = (scanPages ?? []).filter((page) => page.mapping_status === "mapped" || page.mapping_status === "rejected").length;
  const mapped = (scanPages ?? []).filter((page) => page.mapping_status === "mapped").length;
  const scanStatus = terminal === (scanPages?.length ?? 0) ? "mapped" : mapped > 0 ? "partially_mapped" : "needs_mapping";
  const { error: scanUpdateError } = await supabase.from("paper_mode_scans").update({ status: scanStatus, updated_at: new Date().toISOString() }).eq("id", scanId).eq("paper_mode_job_id", jobId);
  if (scanUpdateError) throw scanUpdateError;
  const { data: scans, error: scansError } = await supabase.from("paper_mode_scans").select("status").eq("paper_mode_job_id", jobId);
  if (scansError) throw scansError;
  const jobStatus = scans?.length && scans.every((scan) => scan.status === "mapped" || scan.status === "rejected") ? "ready_to_mark" : "mapping";
  const { error: jobError } = await supabase.from("paper_mode_jobs").update({ status: jobStatus, updated_at: new Date().toISOString() }).eq("id", jobId);
  if (jobError) throw jobError;
}

async function requireOwnedJob(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, jobId: string, ownerProfileId: string) {
  const { data, error } = await supabase.from("paper_mode_jobs").select("id,owner_profile_id,assessment_id,assessment_version_id,status").eq("id", jobId).eq("owner_profile_id", ownerProfileId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Paper Mode job not found in this institution.");
  return data;
}

function requiredId(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) throw new Error(`${name} is required.`);
  return value;
}

function optionalText(formData: FormData, name: string, maxLength: number) {
  return String(formData.get(name) ?? "").trim().slice(0, maxLength) || null;
}
