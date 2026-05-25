import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  info: {
    icon: Info,
    className: "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted)]",
  },
  success: {
    icon: CheckCircle2,
    className: "border-[#78a86d] bg-[var(--success-bg)] text-[#123d18]",
  },
  danger: {
    icon: AlertCircle,
    className: "border-[#e7a09a] bg-[var(--danger-bg)] text-[var(--danger)]",
  },
};

export function StatusMessage({
  tone = "info",
  children,
  className,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
  className?: string;
}) {
  const Icon = tones[tone].icon;
  return (
    <div className={cn("flex items-start gap-2 rounded-md border p-3 text-sm leading-6", tones[tone].className, className)}>
      <Icon className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
