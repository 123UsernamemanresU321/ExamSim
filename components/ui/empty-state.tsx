import { FileText } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md border border-dashed border-[var(--border)] bg-[var(--surface-muted)] p-5 text-sm", className)}>
      <div className="flex items-center gap-2 font-semibold text-[var(--ink)]">
        <FileText size={16} aria-hidden="true" />
        <p>{title}</p>
      </div>
      <p className="mt-1 max-w-2xl leading-6 text-[var(--muted)]">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
