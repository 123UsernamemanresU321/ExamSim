import { GuestIdentityForm } from "@/components/exam/guest-identity-form";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

export default async function ExamIdentityPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code = "" } = await searchParams;
  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-10">
      <div className="mx-auto max-w-xl">
        <ButtonLink href="/exam" variant="ghost" className="mb-4 px-0">Back to code entry</ButtonLink>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">Student identity</p>
          <h1 className="mt-3 text-2xl font-semibold text-[var(--ink)]">Confirm who is sitting this exam</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Code <code className="font-mono text-[var(--ink)]">{code || "not supplied"}</code>
          </p>
          <div className="mt-6">
            <GuestIdentityForm code={code} />
          </div>
        </Card>
      </div>
    </main>
  );
}
