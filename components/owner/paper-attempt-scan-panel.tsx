import { FileScan } from "lucide-react";
import { PaperScanOpenButton } from "@/components/owner/paper-scan-upload-panel";
import { Badge } from "@/components/ui/badge";

export type PaperAttemptScan = {
  pageId: string;
  pageNumber: number;
  questionNodeId: string | null;
  mappingStatus: string;
  objectPath: string;
  fileName: string | null;
};

export function PaperAttemptScanPanel({ scans }: { scans: PaperAttemptScan[] }) {
  if (!scans.length) return null;
  return (
    <section className="mt-4 border-y border-[var(--border)] bg-white px-4 py-3" aria-label="Mapped Paper Mode scans">
      <div className="flex items-center gap-2"><FileScan size={17} className="text-[var(--primary)]" /><h2 className="text-sm font-semibold text-[var(--ink)]">Mapped Paper Mode scans</h2><Badge tone="success">{scans.length} page{scans.length === 1 ? "" : "s"}</Badge></div>
      <p className="mt-1 text-xs text-[var(--muted)]">These private scan pages were manually linked to this attempt. Open the relevant page alongside rubric marking.</p>
      <div className="mt-3 flex flex-wrap gap-2">{scans.map((scan) => <PaperScanOpenButton key={scan.pageId} objectPath={scan.objectPath} pageNumber={scan.pageNumber} />)}</div>
    </section>
  );
}
