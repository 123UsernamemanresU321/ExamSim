import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

const tones = {
  neutral: "border-[var(--border)] bg-white text-[var(--muted)]",
  info: "border-[#9aa7bd] bg-[var(--surface-muted)] text-[var(--primary)]",
  success: "border-[#78a86d] bg-[var(--success-bg)] text-[#123d18]",
  warning: "border-[#d7b85f] bg-[var(--warning-bg)] text-[var(--warning)]",
  danger: "border-[#e7a09a] bg-[var(--danger-bg)] text-[var(--danger)]",
  accent: "border-[#9aa7bd] bg-[var(--surface-muted)] text-[var(--primary)]",
};

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
