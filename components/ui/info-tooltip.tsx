import { Info } from "lucide-react";

export function InfoTooltip({ label, children }: { label: string; children: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        className="grid size-5 place-items-center rounded-full border border-[var(--border)] bg-white text-[var(--muted)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)]"
        aria-label={`${label}: ${children}`}
      >
        <Info size={13} aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-7 z-20 hidden w-72 -translate-x-1/2 rounded-md border border-[var(--border)] bg-white p-3 text-xs font-normal leading-5 text-[var(--muted)] shadow-lg group-focus-within:block group-hover:block"
      >
        {children}
      </span>
    </span>
  );
}
