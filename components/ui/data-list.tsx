import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DataList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-[var(--shadow-card)]", className)}>{children}</div>;
}

export function DataListRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-[var(--border)] p-4 last:border-b-0 transition-colors hover:bg-[var(--surface-muted)]/60", className)}>
      {children}
    </div>
  );
}

export function DataListMeta({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]", className)}>{children}</div>;
}

export function DataTable({
  headers,
  children,
  className,
}: {
  headers: string[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-[var(--border)] bg-white shadow-[var(--shadow-card)]", className)}>
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] text-left text-xs font-semibold uppercase tracking-[0.1em] text-[var(--subtle)]">
            {headers.map((header) => (
              <th key={header} className="px-4 py-3">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function DataTableRow({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn("border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-muted)]/55", className)}>{children}</tr>;
}

export function DataTableCell({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>;
}
