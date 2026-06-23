import { sanitizeExamHtml } from "@/lib/examsim/sanitize-exam-html";

type AllowedMaterial = {
  id: string;
  title: string;
  material_type: string;
  object_path: string | null;
  content_html: string | null;
  requirement?: "allowed" | "required";
  signed_url?: string | null;
};

export function StudentMaterialsDrawer({ materials }: { materials: AllowedMaterial[] }) {
  if (!materials.length) return null;
  return (
    <details className="rounded-lg border border-[var(--border)] bg-white p-4">
      <summary className="cursor-pointer font-semibold text-[var(--primary)]">Exam booklets and resources</summary>
      <div className="mt-3 grid gap-3">
        {materials.map((material) => (
          <div key={material.id} className="rounded-md border border-[var(--border)] p-3">
            <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{material.title}</p>{material.requirement === "required" ? <span className="rounded-[2px] bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-900">Required</span> : <span className="rounded-[2px] bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-800">Allowed</span>}</div>
            <p className="text-xs uppercase tracking-widest text-[var(--subtle)]">{material.material_type.replaceAll("_", " ")}</p>
            {material.content_html ? <div className="mt-2 text-sm text-[var(--muted)]" dangerouslySetInnerHTML={{ __html: sanitizeExamHtml(material.content_html) }} /> : null}
            {material.signed_url ? (
              <a className="mt-2 inline-flex font-semibold text-[var(--primary)]" href={material.signed_url} target="_blank" rel="noreferrer">
                Open material
              </a>
            ) : material.object_path ? (
              <p className="mt-2 text-sm text-[var(--muted)]">Owner-provided file is currently unavailable. Refresh or ask the owner to check the material path.</p>
            ) : null}
          </div>
        ))}
      </div>
    </details>
  );
}
