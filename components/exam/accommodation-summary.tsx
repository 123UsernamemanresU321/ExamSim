import { Accessibility, BookOpenCheck, Calculator } from "lucide-react";
import type { StudentAccommodationPolicy } from "@/lib/examsim/accommodations";

export function AccommodationSummary({ policy }: { policy: StudentAccommodationPolicy }) {
  const hasDisplayPolicy = policy.font_scale_percent > 100 || policy.dyslexia_font || policy.contrast_mode === "high";
  const hasTools = policy.calculator_policy !== "none" || policy.formula_booklet_allowed || policy.allowed_materials.length > 0
    || policy.tts_allowed || policy.desmos_allowed || policy.geogebra_allowed || policy.chemistry_editor_allowed;
  const hasBreak = policy.rest_break_allowed;
  if (!hasDisplayPolicy && !hasTools && !hasBreak) return null;

  return (
    <section className="rounded-[4px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-card)]" aria-labelledby="accommodation-summary-heading">
      <div className="flex items-center gap-2">
        <Accessibility size={16} aria-hidden="true" className="text-[var(--primary)]" />
        <h2 id="accommodation-summary-heading" className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink)]">
          Approved accommodations
        </h2>
      </div>
      <dl className="mt-3 grid gap-2 text-xs leading-5">
        {policy.font_scale_percent > 100 ? <PolicyRow label="Text size" value={`${policy.font_scale_percent}%`} /> : null}
        {policy.dyslexia_font ? <PolicyRow label="Readable font" value="Enabled" /> : null}
        {policy.contrast_mode === "high" ? <PolicyRow label="Contrast" value="High" /> : null}
        {hasBreak ? <PolicyRow label="Rest break" value={`Invigilator controlled${policy.rest_break_max_minutes ? `, up to ${policy.rest_break_max_minutes} min` : ""}`} /> : null}
      </dl>
      {hasTools ? (
        <div className="mt-3 grid gap-2 border-t border-[var(--border)] pt-3 text-xs leading-5 text-[var(--muted)]">
          <p className="flex items-center gap-2"><Calculator size={14} aria-hidden="true" /><span><strong className="text-[var(--ink)]">Calculator:</strong> {calculatorLabel(policy.calculator_policy)}</span></p>
          <p className="flex items-center gap-2"><BookOpenCheck size={14} aria-hidden="true" /><span><strong className="text-[var(--ink)]">Formula booklet:</strong> {policy.formula_booklet_allowed ? "Allowed when supplied by your teacher" : "Not allowed"}</span></p>
          {policy.allowed_materials.length ? (
            <p><strong className="text-[var(--ink)]">Approved materials:</strong> {policy.allowed_materials.join(", ")}</p>
          ) : null}
          {policy.tts_allowed || policy.desmos_allowed || policy.geogebra_allowed || policy.chemistry_editor_allowed ? (
            <p>
              <strong className="text-[var(--ink)]">Built-in tools:</strong>{" "}
              {[policy.tts_allowed ? "Read aloud" : null, policy.desmos_allowed ? "Desmos" : null, policy.geogebra_allowed ? "GeoGebra geometry" : null, policy.chemistry_editor_allowed ? "Ketcher" : null].filter(Boolean).join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function PolicyRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3"><dt className="text-[var(--muted)]">{label}</dt><dd className="text-right font-semibold text-[var(--ink)]">{value}</dd></div>;
}

function calculatorLabel(policy: StudentAccommodationPolicy["calculator_policy"]) {
  if (policy === "none") return "Not allowed";
  if (policy === "basic") return "Basic calculator allowed";
  if (policy === "scientific") return "Scientific calculator allowed";
  return "Graphing calculator permitted";
}
