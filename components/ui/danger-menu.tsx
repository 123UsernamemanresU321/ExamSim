"use client";

import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export function DangerMenu({
  label = "More actions",
  children,
  className,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={cn("relative inline-block", className)}>
      <summary className="inline-flex min-h-9 cursor-pointer list-none items-center justify-center gap-2 rounded-[2px] border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-muted)] [&::-webkit-details-marker]:hidden">
        <MoreHorizontal size={16} aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </summary>
      <div className="absolute right-0 z-30 mt-2 min-w-52 rounded-[4px] border border-[var(--border)] bg-white p-2 shadow-[var(--shadow-popover)]">
        {children}
      </div>
    </details>
  );
}

export function DangerMenuItem({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded-[2px] px-3 py-2 text-left text-xs font-semibold text-[var(--danger)] transition-colors hover:bg-[var(--danger-bg)] disabled:cursor-not-allowed disabled:opacity-50"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
