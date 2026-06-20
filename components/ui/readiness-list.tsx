import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ReadinessList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="list"
      className={cn(
        "min-w-0 overflow-hidden rounded-[4px] border border-[var(--border)] bg-white divide-y divide-[var(--border)]",
        className,
      )}
      {...props}
    />
  );
}

export function ReadinessListRow({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <article
      role="listitem"
      className={cn("min-w-0 px-4 py-4 transition-colors hover:bg-[var(--surface-muted)]/45 sm:px-5", className)}
      {...props}
    />
  );
}

export function ReadinessListDetails({ className, ...props }: HTMLAttributes<HTMLDListElement>) {
  return (
    <dl
      className={cn(
        "mt-4 grid min-w-0 gap-4 border-t border-[var(--border)] pt-4 md:grid-cols-2 xl:grid-cols-3",
        className,
      )}
      {...props}
    />
  );
}

export function ReadinessListDetail({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--subtle)]">{label}</dt>
      <dd className="mt-1 min-w-0 break-words text-[12px] leading-5 text-[var(--muted)] [overflow-wrap:anywhere]">
        {children}
      </dd>
    </div>
  );
}
