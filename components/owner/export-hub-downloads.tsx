"use client";

import { Download, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";
import {
  buildExportFile,
  type ExportHubDataset,
  type ExportHubItem,
  type ExportHubItemStatus,
} from "@/lib/examsim/export-hub";

export function ExportHubDownloads({
  catalog,
  dataset,
}: {
  catalog: ExportHubItem[];
  dataset: ExportHubDataset;
}) {
  function downloadExport(item: ExportHubItem) {
    const file = buildExportFile(item.key, dataset);
    if (!file) return;
    const blob = new Blob([file.content], { type: file.mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.filename;
    anchor.rel = "noopener";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <DataTable headers={["Export", "Status", "Rows", "Action"]} className="shadow-none">
      {catalog.map((item) => {
        const downloadable = ["markbook_csv", "roster_csv", "cohort_csv", "assessment_inventory_json", "analytics_json"].includes(item.key);
        return (
          <DataTableRow key={item.key}>
            <DataTableCell className="min-w-[280px]">
              <p className="font-semibold text-[var(--ink)]">{item.title}</p>
              <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">{item.description}</p>
              {item.warnings.length ? (
                <ul className="mt-2 grid gap-1 text-[12px] leading-5 text-[var(--warning)]">
                  {item.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              ) : null}
            </DataTableCell>
            <DataTableCell className="whitespace-nowrap">
              <Badge tone={toneForStatus(item.status)}>{item.status.replaceAll("_", " ")}</Badge>
              <p className="mt-2 font-mono text-[11px] text-[var(--muted)]">{item.format}</p>
            </DataTableCell>
            <DataTableCell className="font-mono text-[var(--muted)]">{item.rowCount}</DataTableCell>
            <DataTableCell className="min-w-[190px]">
              {downloadable ? (
                <Button
                  type="button"
                  variant={item.status === "empty" ? "secondary" : "primary"}
                  disabled={item.status === "empty"}
                  onClick={() => downloadExport(item)}
                >
                  <Download size={16} aria-hidden="true" />
                  Download {item.format}
                </Button>
              ) : item.key === "qti_zip" ? (
                <ButtonLink href="/owner/assessments" variant="secondary">
                  <ExternalLink size={16} aria-hidden="true" />
                  Open assessment
                </ButtonLink>
              ) : (
                <Button type="button" variant="secondary" disabled>
                  Not available
                </Button>
              )}
            </DataTableCell>
          </DataTableRow>
        );
      })}
    </DataTable>
  );
}

function toneForStatus(status: ExportHubItemStatus) {
  if (status === "ready") return "success" as const;
  if (status === "edge_export") return "info" as const;
  if (status === "needs_review") return "warning" as const;
  if (status === "unsupported") return "danger" as const;
  return "neutral" as const;
}
