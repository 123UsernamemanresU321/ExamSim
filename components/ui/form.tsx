import { cn } from "@/lib/utils";
import type { InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { buildFieldHelp } from "@/lib/form-field-help";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-semibold tracking-[0.02em] text-black", className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const title = props.title ?? buildFieldHelp({
    name: props.name,
    type: props.type,
    placeholder: typeof props.placeholder === "string" ? props.placeholder : null,
    label: props["aria-label"] ? String(props["aria-label"]) : null,
    tagName: "input",
  });
  return (
    <input
      className={cn(
        "min-h-10 w-full rounded-[2px] border border-[var(--border)] bg-white px-3 py-2 text-sm transition-colors placeholder:text-[#6b7280] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/15 disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)] disabled:text-[var(--muted)]",
        className,
      )}
      title={title}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const title = props.title ?? buildFieldHelp({
    name: props.name,
    placeholder: typeof props.placeholder === "string" ? props.placeholder : null,
    label: props["aria-label"] ? String(props["aria-label"]) : null,
    tagName: "textarea",
  });
  return (
    <textarea
      className={cn(
        "min-h-32 w-full rounded-[2px] border border-[var(--border)] bg-white px-3 py-2 text-sm transition-colors placeholder:text-[#6b7280] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/15 disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)] disabled:text-[var(--muted)]",
        className,
      )}
      title={title}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const title = props.title ?? buildFieldHelp({
    name: props.name,
    label: props["aria-label"] ? String(props["aria-label"]) : null,
    tagName: "select",
  });
  return (
    <select
      className={cn(
        "min-h-10 w-full rounded-[2px] border border-[var(--border)] bg-white px-3 py-2 text-sm transition-colors focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/15 disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)] disabled:text-[var(--muted)]",
        className,
      )}
      title={title}
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
