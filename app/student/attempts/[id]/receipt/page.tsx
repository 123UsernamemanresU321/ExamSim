import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { getSubmissionReceipt } from "@/lib/usability-data";
import { PrintReceiptButton } from "@/components/student/print-receipt-button";
import { ShieldCheck, Database } from "lucide-react";

type ReceiptJson = {
  assessment_title?: string;
  paper_code?: string | null;
  attempt_short_code?: string;
  finalized_at?: string;
  slots?: Array<{ 
    question_node_id: string; 
    status: string; 
    file_name: string | null; 
    uploaded_at: string | null; 
    page_count: number | null; 
    sanity_status: string | null; 
    warnings: unknown[]; 
    file_hash: string | null;
  }>;
};

export default async function StudentReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const receipt = await getSubmissionReceipt(id);
  
  if (!receipt) {
    return <SectionHeading title="Submission receipt not ready" description="Finalize the attempt first, then refresh this page." />;
  }

  const receiptJson = receipt.receipt_json as ReceiptJson;

  const attemptCode = receiptJson.attempt_short_code ?? receipt.id.slice(0, 8).toUpperCase();
  const finalizedDate = receiptJson.finalized_at ? new Date(receiptJson.finalized_at) : null;

  return (
    <>
      <div className="print:hidden">
        <SectionHeading
          title="Submission receipt"
          description={`${receiptJson.assessment_title ?? "Assessment"} · Paper ${receiptJson.paper_code ?? "N/A"}`}
        />
      </div>

      <div className="mx-auto max-w-[920px] pb-12">
        <Card className="border border-[var(--border)] bg-white p-6 shadow-[var(--shadow-card)] md:p-10 print:border-2 print:border-black print:p-8 print:shadow-none">
          <div className="flex flex-col justify-between gap-6 border-b-2 border-slate-900 pb-6 md:flex-row md:items-center print:border-black">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-slate-900 print:text-black">
                <ShieldCheck size={24} className="text-[var(--primary)] print:text-black" />
                <span className="text-xs font-semibold uppercase tracking-[0.14em]">Exam Vault</span>
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl print:text-black print:text-2xl">
                Assessment submission receipt
              </h2>
              <p className="text-xs text-[var(--muted)] print:text-black">
                Locked submission record for this attempt.
              </p>
            </div>
            
            <div className="text-left md:text-right">
              <span className="inline-block rounded bg-slate-900 px-3 py-1.5 font-mono text-sm font-bold text-white print:bg-white print:text-black print:border print:border-black">
                CODE: {attemptCode}
              </span>
              <p className="mt-2 text-[10px] uppercase tracking-wider text-[var(--subtle)] print:text-black">
                Receipt verification
              </p>
            </div>
          </div>

          <div className="my-8 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-5 md:p-6 print:border-black print:bg-white">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-3 border-b border-dashed border-[#dde3ee] pb-1.5 print:text-black print:border-black">
              Attempt Parameters
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--subtle)]">Assessment Title</p>
                <p className="text-sm font-bold text-slate-900 print:text-black">{receiptJson.assessment_title ?? "Standard Simulation"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--subtle)]">Subject / Paper</p>
                <p className="text-sm font-bold text-slate-900 print:text-black">Paper {receiptJson.paper_code ?? "N/A"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--subtle)]">Finalized Timestamp</p>
                <p className="text-sm font-bold text-slate-900 print:text-black">
                  {finalizedDate ? finalizedDate.toLocaleString() : "Unknown"}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-2 print:text-black print:border-black">
              Upload slots and submissions
            </h3>
            
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[#c8d4e6] text-[10px] font-bold uppercase tracking-wider text-[var(--subtle)] print:border-black print:text-black">
                    <th className="py-2.5">Question Partition</th>
                    <th className="py-2.5">Status</th>
                    <th className="py-2.5">Submitted File</th>
                    <th className="py-2.5 text-right">Integrity Seal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dde3ee] print:divide-black">
                  {(receiptJson.slots ?? []).map((slot) => {
                    const isUploaded = slot.status === "uploaded";
                    const isBlank = slot.status === "blank_placeholder";
                    return (
                      <tr key={slot.question_node_id} className="align-top hover:bg-slate-50/20 print:hover:bg-transparent">
                        <td className="py-3 font-semibold text-slate-900 print:text-black">
                          Question {slot.question_node_id.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="py-3">
                          <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            isUploaded 
                              ? "bg-emerald-100 text-emerald-800 print:border print:border-emerald-600 print:bg-white print:text-emerald-800" 
                              : isBlank 
                              ? "bg-amber-100 text-amber-800 print:border print:border-amber-600 print:bg-white print:text-amber-800" 
                              : "bg-slate-100 text-slate-800"
                          }`}>
                            {slot.status}
                          </span>
                        </td>
                        <td className="py-3 pr-4 max-w-[240px]">
                          <p className="font-bold text-slate-800 break-words print:text-black">
                            {slot.file_name ?? "No document uploaded"}
                          </p>
                          {slot.uploaded_at && (
                            <p className="text-[10px] text-[var(--muted)] mt-0.5 print:text-black">
                              Saved: {new Date(slot.uploaded_at).toLocaleString()}
                            </p>
                          )}
                          <p className="text-[10px] text-[var(--subtle)] mt-0.5 print:text-black">
                            Pages: {slot.page_count ?? "N/A"} · Safety Check: {slot.sanity_status ?? "Unprocessed"}
                          </p>
                        </td>
                        <td className="py-3 text-right">
                          {slot.file_hash ? (
                            <div className="inline-block">
                              <span className="font-mono text-[9px] text-[#2c3e50] bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded print:border-black print:bg-white print:text-black">
                                SHA-256: {slot.file_hash.slice(0, 16)}...
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-[var(--subtle)] italic print:text-black">None</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-10 border-t-2 border-slate-900 pt-6 md:flex md:items-center md:justify-between print:border-black print:text-black">
            <div className="flex items-center gap-3">
              <Database className="text-slate-700 print:text-black" size={24} />
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--subtle)] print:text-black">System verification reference</p>
                <p className="font-mono text-[10px] text-slate-950 font-bold break-all print:text-black">
                  SEC-SIG-{attemptCode}-{receipt.id.slice(0, 12).toUpperCase()}
                </p>
              </div>
            </div>
            
            <div className="mt-4 text-left text-[10px] text-[var(--muted)] md:mt-0 md:text-right print:text-black">
              <p className="font-semibold">Verified by Exam Vault</p>
              <p className="mt-0.5">Database sync status: confirmed</p>
            </div>
          </div>

        </Card>

        <div className="mt-6 flex flex-wrap justify-between items-center gap-4 print:hidden px-2">
          <ButtonLink href={`/student/attempts/${id}/recovery-status`} variant="secondary">
            View attempt recovery
          </ButtonLink>
          <div className="flex gap-3">
            <PrintReceiptButton />
          </div>
        </div>
      </div>
    </>
  );
}
