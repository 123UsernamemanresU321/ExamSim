import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  description,
  icon,
  tone = "neutral",
  className,
}: {
  label: string;
  value: ReactNode;
  description?: string;
  icon?: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  className?: string;
}) {
  const tones = {
    neutral: "border-[var(--border)]",
    success: "border-l-[#78a86d]",
    warning: "border-l-[#d7b85f]",
    danger: "border-l-[#e7a09a]",
    info: "border-l-[#9aa7bd]",
  };

  return (
    <section className={cn("rounded-lg border bg-white p-4 shadow-[var(--shadow-card)]", tone === "neutral" ? tones.neutral : `border-[var(--border)] border-l-4 ${tones[tone]}`, className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--subtle)]">{label}</p>
        {icon ? <div className="text-[var(--primary)]">{icon}</div> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink)]">{value}</p>
      {description ? <p className="mt-1 text-sm leading-5 text-[var(--muted)]">{description}</p> : null}
    </section>
  );
}
