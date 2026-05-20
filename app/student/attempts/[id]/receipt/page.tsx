import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSubmissionReceipt } from "@/lib/usability-data";

export default async function StudentReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const receipt = await getSubmissionReceipt(id);
  if (!receipt) {
    return <SectionHeading title="Submission receipt not ready" description="Finalize the attempt first, then refresh this page." />;
  }
  const receiptJson = receipt.receipt_json as {
    assessment_title?: string;
    paper_code?: string | null;
    attempt_short_code?: string;
    finalized_at?: string;
    slots?: Array<{ question_node_id: string; status: string; file_name: string | null; uploaded_at: string | null; page_count: number | null; sanity_status: string | null; warnings: unknown[]; file_hash: string | null }>;
  };
  return (
    <>
      <SectionHeading
        title="Submission Receipt"
        description={`${receiptJson.assessment_title ?? "Assessment"} · ${receiptJson.paper_code ?? "No paper code"} · Receipt ${receiptJson.attempt_short_code ?? receipt.id.slice(0, 8)}`}
      />
      <Card className="print:shadow-none">
        <div className="mb-5 flex flex-wrap justify-between gap-3 border-b border-[var(--border)] pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--subtle)]">Finalized</p>
            <p className="font-semibold">{receiptJson.finalized_at ? new Date(receiptJson.finalized_at).toLocaleString() : "Unknown"}</p>
          </div>
          <p className="rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold print:hidden">
            Use your browser print command to save this receipt.
          </p>
        </div>
        <div className="grid gap-3">
          {(receiptJson.slots ?? []).map((slot) => (
            <div key={slot.question_node_id} className="rounded-md border border-[var(--border)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">Question slot {slot.question_node_id.slice(0, 8)}</p>
                <Badge tone={slot.status === "uploaded" ? "success" : slot.status === "missing" ? "warning" : "neutral"}>{slot.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-[var(--muted)]">{slot.file_name ?? "No file"} · {slot.uploaded_at ? new Date(slot.uploaded_at).toLocaleString() : "not uploaded"}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">Pages: {slot.page_count ?? "not checked"} · Sanity: {slot.sanity_status ?? "not checked"}</p>
              {slot.file_hash ? <p className="mt-1 break-all text-[10px] text-[var(--subtle)]">SHA-256: {slot.file_hash}</p> : null}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
