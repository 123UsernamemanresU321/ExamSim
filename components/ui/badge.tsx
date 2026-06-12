import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

const tones = {
  neutral: "border-[var(--border)] bg-white text-[var(--muted)]",
  info: "border-[#bfdbfe] bg-[#dbeafe] text-[#1d4ed8]",
  success: "border-[rgba(22,101,52,0.2)] bg-[var(--success-bg)] text-[var(--success)]",
  warning: "border-[rgba(146,64,14,0.2)] bg-[var(--warning-bg)] text-[var(--warning)]",
  danger: "border-[rgba(186,26,26,0.2)] bg-[var(--danger-bg)] text-[var(--danger)]",
  accent: "border-[#bfdbfe] bg-[#dbeafe] text-[#1d4ed8]",
};

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[2px] border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.025em]",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
