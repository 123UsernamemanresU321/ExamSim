import type { AttemptSummary } from "@/lib/live-data";
import type { UploadSanityCheck, UploadSlot } from "@/types/database";

export type SubmissionReceiptJson = {
  assessment_title: string;
  paper_code: string | null;
  attempt_short_code: string;
  finalized_at: string;
  slots: Array<{
    question_node_id: string;
    status: UploadSlot["status"];
    file_name: string | null;
    uploaded_at: string | null;
    page_count: number | null;
    sanity_status: string | null;
    warnings: unknown[];
    file_hash: string | null;
  }>;
};

export function buildSubmissionReceipt(input: {
  attempt: Pick<AttemptSummary, "id" | "title" | "paper_code">;
  finalizedAt: string;
  uploadSlots: UploadSlot[];
  sanityChecks: UploadSanityCheck[];
}): SubmissionReceiptJson {
  const latestCheckBySlot = new Map<string, UploadSanityCheck>();
  for (const check of [...input.sanityChecks].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    latestCheckBySlot.set(check.upload_slot_id, check);
  }
  return {
    assessment_title: input.attempt.title,
    paper_code: input.attempt.paper_code,
    attempt_short_code: input.attempt.id.slice(0, 8).toUpperCase(),
    finalized_at: input.finalizedAt,
    slots: input.uploadSlots.map((slot) => {
      const check = latestCheckBySlot.get(slot.id);
      return {
        question_node_id: slot.question_node_id,
        status: slot.status,
        file_name: slot.original_file_name,
        uploaded_at: slot.uploaded_at,
        page_count: check?.page_count ?? null,
        sanity_status: check?.status ?? null,
        warnings: Array.isArray(check?.warnings_json) ? check.warnings_json : [],
        file_hash: check?.file_hash ?? null,
      };
    }),
  };
}
