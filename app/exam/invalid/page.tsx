import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ExamInvalidPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-4 py-10">
      <Card className="max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--danger)]">Invalid code</p>
        <h1 className="mt-3 text-2xl font-semibold text-[var(--ink)]">We could not find that exam.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Check the code on your instructions. Codes are not case sensitive, but every letter and number matters.
        </p>
        <ButtonLink href="/exam" className="mt-6">Try again</ButtonLink>
      </Card>
    </main>
  );
}
