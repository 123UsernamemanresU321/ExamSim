import { cn } from "@/lib/utils";
import type { InputHTMLAttributes, LabelHTMLAttributes, TextareaHTMLAttributes } from "react";
import { InfoTooltip } from "@/components/ui/info-tooltip";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-semibold text-[var(--ink)]", className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-11 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-32 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  description,
  tooltip,
  children,
}: {
  label: string;
  description?: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  const helpText = tooltip ?? description;
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <Label>{label}</Label>
        {helpText ? <InfoTooltip label={label}>{helpText}</InfoTooltip> : null}
      </div>
      {children}
      {description ? <p className="text-xs leading-5 text-[var(--muted)]">{description}</p> : null}
    </div>
  );
}
