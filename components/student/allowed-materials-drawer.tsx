type AllowedMaterial = {
  id: string;
  title: string;
  material_type: string;
  object_path: string | null;
  content_html: string | null;
  signed_url?: string | null;
};

export function StudentMaterialsDrawer({ materials }: { materials: AllowedMaterial[] }) {
  if (!materials.length) return null;
  return (
    <details className="rounded-lg border border-[var(--border)] bg-white p-4">
      <summary className="cursor-pointer font-semibold text-[var(--primary)]">Allowed Materials</summary>
      <div className="mt-3 grid gap-3">
        {materials.map((material) => (
          <div key={material.id} className="rounded-md border border-[var(--border)] p-3">
            <p className="font-semibold">{material.title}</p>
            <p className="text-xs uppercase tracking-widest text-[var(--subtle)]">{material.material_type.replaceAll("_", " ")}</p>
            {material.content_html ? <div className="mt-2 text-sm text-[var(--muted)]" dangerouslySetInnerHTML={{ __html: material.content_html }} /> : null}
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
