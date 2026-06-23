import { AlertTriangle, Ban, BookOpenCheck, CheckCircle2, CircleDot } from "lucide-react";
import type { ExamPolicySummary as ExamPolicySummaryData, ExamPolicyRequirement } from "@/lib/examsim/exam-policy";

export function ExamPolicySummary({ policy, compact = false }: { policy?: ExamPolicySummaryData | null; compact?: boolean }) {
  if (!policy) return null;
  const entries = [
    ...policy.resources.map((resource) => ({
      key: `resource-${resource.id}`,
      label: resource.title,
      detail: resource.material_type.replaceAll("_", " "),
      requirement: resource.requirement,
    })),
    ...policy.tools.map((tool) => ({
      key: `tool-${tool.code}`,
      label: toolLabel(tool.code, tool.configuration),
      detail: toolDetail(tool.code),
      requirement: tool.requirement,
    })),
    ...policy.allowed_materials.map((material, index) => ({
      key: `physical-${index}`,
      label: material,
      detail: "approved physical material",
      requirement: "allowed" as const,
    })),
  ];
  if (!entries.length) return null;
  const groups = (["required", "allowed", "prohibited"] as const).map((requirement) => ({
    requirement,
    entries: entries.filter((entry) => entry.requirement === requirement),
  }));
  const requiredGdc = policy.tools.some((tool) => tool.code === "physical_calculator" && tool.requirement === "required" && tool.configuration.calculator_class === "gdc");

  return (
    <section className="rounded-[4px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-card)]" aria-labelledby="exam-policy-summary-heading">
      <div className="flex items-center gap-2"><BookOpenCheck size={16} className="text-[var(--primary)]" aria-hidden="true" /><h2 id="exam-policy-summary-heading" className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink)]">Materials and tools</h2></div>
      {requiredGdc ? <div className="mt-3 flex gap-2 rounded-[3px] border border-amber-300 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" /><span>Prepare an approved physical GDC before the exam starts. Desmos does not replace this requirement.</span></div> : null}
      <div className={compact ? "mt-3 grid gap-3" : "mt-4 grid gap-4 md:grid-cols-3"}>
        {groups.map((group) => group.entries.length ? <PolicyGroup key={group.requirement} requirement={group.requirement} entries={group.entries} /> : null)}
      </div>
    </section>
  );
}

function PolicyGroup({ requirement, entries }: { requirement: ExamPolicyRequirement; entries: Array<{ key: string; label: string; detail: string }> }) {
  const title = requirement === "required" ? "Required" : requirement === "allowed" ? "Allowed" : "Not permitted";
  const Icon = requirement === "required" ? CircleDot : requirement === "allowed" ? CheckCircle2 : Ban;
  return <div><p className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] ${requirement === "prohibited" ? "text-red-700" : requirement === "required" ? "text-amber-800" : "text-emerald-800"}`}><Icon size={14} aria-hidden="true" />{title}</p><ul className="mt-2 grid gap-2">{entries.map((entry) => <li key={entry.key} className="rounded-[3px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2"><p className="text-xs font-semibold text-[var(--ink)]">{entry.label}</p><p className="mt-0.5 text-[11px] text-[var(--muted)]">{entry.detail}</p></li>)}</ul></div>;
}

function toolLabel(code: string, configuration: Record<string, string | string[]>) {
  if (code === "physical_calculator") {
    const calculatorClass = configuration.calculator_class;
    return calculatorClass === "gdc" ? "Physical GDC" : calculatorClass === "scientific" ? "Scientific calculator" : calculatorClass === "basic" ? "Basic calculator" : "Calculator";
  }
  if (code === "physical_materials") return "Approved physical materials";
  if (code === "tts") return "Browser read aloud";
  if (code === "desmos") return "Desmos";
  if (code === "geogebra") return "GeoGebra geometry";
  if (code === "chemistry_editor") return "Ketcher chemistry editor";
  return code.replaceAll("_", " ");
}

function toolDetail(code: string) {
  if (code === "physical_calculator") return "physical calculator policy";
  if (code === "tts") return "browser accessibility tool";
  if (code === "desmos") return "browser graphing tool";
  if (code === "geogebra") return "browser geometry tool";
  if (code === "chemistry_editor") return "browser chemistry structure tool";
  return "exam tool policy";
}
