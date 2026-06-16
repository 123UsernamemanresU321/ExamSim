import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default async function ExamNotOpenPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-4 py-10">
      <Card className="max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--warning)]">Not open yet</p>
        <h1 className="mt-3 text-2xl font-semibold text-[var(--ink)]">This exam is not open yet.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          The code {code ? <code className="font-mono text-[var(--ink)]">{code}</code> : "you entered"} is valid, but the exam window has not started.
          Return when your teacher says the waiting room is open.
        </p>
        <ButtonLink href="/exam" className="mt-6">Try another code</ButtonLink>
      </Card>
    </main>
  );
}
