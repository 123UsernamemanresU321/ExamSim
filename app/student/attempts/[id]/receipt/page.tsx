import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";
import { getSubmissionReceipt } from "@/lib/usability-data";
import { PrintReceiptButton } from "@/components/student/print-receipt-button";
import { Database, ShieldCheck } from "lucide-react";

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

      <div className="mx-auto max-w-[1040px] pb-12">
        <Card className="border border-[var(--border)] bg-white p-6 shadow-[var(--shadow-card)] print:border-2 print:border-black print:p-8 print:shadow-none">
          <div className="flex flex-col justify-between gap-5 border-b border-[var(--border)] pb-5 md:flex-row md:items-center print:border-black">
            <div>
              <div className="flex items-center gap-2 text-[var(--ink)] print:text-black">
                <ShieldCheck size={20} className="text-[var(--primary)] print:text-black" />
                <span className="text-xs font-semibold uppercase tracking-[0.14em]">Exam Vault receipt</span>
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink)] print:text-black">
                Locked submission record
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)] print:text-black">
                This readonly proof page records the files and blank submissions sealed at finalization.
              </p>
            </div>
            <div className="text-left md:text-right">
              <Badge tone="neutral" className="font-mono">CODE {attemptCode}</Badge>
              <p className="mt-2 text-[10px] uppercase tracking-wider text-[var(--subtle)] print:text-black">
                Receipt verification
              </p>
            </div>
          </div>

          <dl className="my-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 print:border-black print:bg-white">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--subtle)]">Assessment</dt>
              <dd className="mt-1 text-sm font-semibold text-[var(--ink)] print:text-black">{receiptJson.assessment_title ?? "Standard Simulation"}</dd>
            </div>
            <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 print:border-black print:bg-white">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--subtle)]">Paper</dt>
              <dd className="mt-1 font-mono text-sm font-semibold text-[var(--ink)] print:text-black">{receiptJson.paper_code ?? "N/A"}</dd>
            </div>
            <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 print:border-black print:bg-white">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--subtle)]">Finalized</dt>
              <dd className="mt-1 font-mono text-sm font-semibold text-[var(--ink)] print:text-black">
                {finalizedDate ? finalizedDate.toLocaleString() : "Unknown"}
              </dd>
            </div>
          </dl>

          <DataTable headers={["Question", "Status", "Submitted file", "Integrity"]} className="shadow-none print:border-black">
            {(receiptJson.slots ?? []).map((slot) => {
              const isUploaded = slot.status === "uploaded";
              const isBlank = slot.status === "blank_placeholder";
              return (
                <DataTableRow key={slot.question_node_id} className="print:border-black">
                  <DataTableCell className="font-semibold text-[var(--ink)] print:text-black">
                    Question {slot.question_node_id.slice(0, 8).toUpperCase()}
                  </DataTableCell>
                  <DataTableCell>
                    <Badge tone={isUploaded ? "success" : isBlank ? "warning" : "neutral"}>{slot.status}</Badge>
                  </DataTableCell>
                  <DataTableCell className="max-w-[280px]">
                    <p className="break-words font-semibold text-[var(--ink)] print:text-black">
                      {slot.file_name ?? "No document uploaded"}
                    </p>
                    {slot.uploaded_at ? (
                      <p className="mt-0.5 font-mono text-[10px] text-[var(--muted)] print:text-black">
                        Saved {new Date(slot.uploaded_at).toLocaleString()}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-[10px] text-[var(--subtle)] print:text-black">
                      Pages {slot.page_count ?? "N/A"} · Sanity {slot.sanity_status ?? "Unprocessed"}
                    </p>
                  </DataTableCell>
                  <DataTableCell className="text-right">
                    {slot.file_hash ? (
                      <span className="rounded-[2px] border border-[var(--border)] bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--ink)] print:border-black print:bg-white print:text-black">
                        SHA-256 {slot.file_hash.slice(0, 16)}...
                      </span>
                    ) : (
                      <span className="text-[10px] italic text-[var(--subtle)] print:text-black">None</span>
                    )}
                  </DataTableCell>
                </DataTableRow>
              );
            })}
          </DataTable>

          <div className="mt-6 border-t border-[var(--border)] pt-5 md:flex md:items-center md:justify-between print:border-black print:text-black">
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
