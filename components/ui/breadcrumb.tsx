"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function Breadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("mb-6 flex flex-wrap items-center gap-1 text-[13px] text-[var(--muted)]", className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <div key={index} className="flex items-center gap-1.5">
            {index > 0 && (
              <ChevronRight size={13} className="text-[var(--border)]" aria-hidden="true" />
            )}
            {isLast || !item.href ? (
              <span className={cn("font-medium text-[var(--ink)]", isLast && "font-semibold")}>
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="transition-colors hover:text-[var(--ink)] hover:underline decoration-[var(--primary)]/30 underline-offset-4"
              >
                {item.label}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
