export function SectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">{title}</h1>
      {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{description}</p> : null}
    </div>
  );
}
