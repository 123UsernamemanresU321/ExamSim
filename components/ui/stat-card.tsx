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
    success: "border-l-[var(--success)]",
    warning: "border-l-[var(--warning)]",
    danger: "border-l-[var(--danger)]",
    info: "border-l-[var(--primary)]",
  };

  return (
    <section className={cn("rounded-[4px] border bg-white p-4 shadow-[var(--shadow-card)]", tone === "neutral" ? tones.neutral : `border-[var(--border)] border-l-4 ${tones[tone]}`, className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--subtle)]">{label}</p>
        {icon ? <div className="text-[var(--primary)]">{icon}</div> : null}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-[-0.02em] text-black">{value}</p>
      {description ? <p className="mt-1 text-sm leading-5 text-[var(--muted)]">{description}</p> : null}
    </section>
  );
}
