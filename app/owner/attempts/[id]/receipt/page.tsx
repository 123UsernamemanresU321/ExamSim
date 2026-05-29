import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { getSubmissionReceipt } from "@/lib/usability-data";

export default async function OwnerSubmissionReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const receipt = await getSubmissionReceipt(id);
  if (!receipt) return <SectionHeading title="No submission receipt" description="The attempt has not produced a receipt yet." />;
  const receiptJson = (receipt as any).receipt_json as { assessment_title?: string; paper_code?: string | null; finalized_at?: string | null; slots?: Array<Record<string, unknown>> };
  return (
    <>
      <SectionHeading
        title="Submission Receipt"
        description={`${receiptJson.assessment_title ?? "Assessment"} · ${receiptJson.paper_code ?? "No paper code"}`}
      />
      <Card className="print:shadow-none">
        <p className="text-sm font-semibold text-[var(--ink)]">
          Finalized: {receiptJson.finalized_at ? new Date(receiptJson.finalized_at).toLocaleString() : "Unknown"}
        </p>
        <div className="mt-5 grid gap-3">
          {(receiptJson.slots ?? []).map((slot, index) => (
            <div key={index} className="rounded-lg border border-[var(--border)] bg-white p-4 text-sm">
              <p className="font-semibold text-[var(--ink)]">{String(slot.question_label ?? slot.question_node_id ?? `Slot ${index + 1}`)}</p>
              <p className="mt-1 text-[var(--muted)]">Status: {String(slot.status ?? "unknown")}</p>
              {slot.file_name ? <p className="text-[var(--muted)]">File: {String(slot.file_name)}</p> : null}
              {slot.page_count ? <p className="text-[var(--muted)]">Pages: {String(slot.page_count)}</p> : null}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
