import { LockKeyhole } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default async function OwnerUnauthorizedPage({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const { required } = await searchParams;
  return (
    <Card className="mx-auto max-w-2xl">
      <LockKeyhole size={24} aria-hidden="true" className="text-[var(--warning)]" />
      <h1 className="mt-4 text-2xl font-semibold text-[var(--ink)]">Permission required</h1>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
        Your institution role does not allow this workflow. Ask the owner to change your role if this access is required.
      </p>
      {required ? <p className="mt-4 font-mono text-xs text-[var(--subtle)]">Required permission: {required.replaceAll("_", " ")}</p> : null}
      <ButtonLink className="mt-6" href="/owner">Return to dashboard</ButtonLink>
    </Card>
  );
}
