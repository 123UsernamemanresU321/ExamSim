import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function GuestLinkAccountPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-4 py-10">
      <Card className="max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">Optional</p>
        <h1 className="mt-3 text-2xl font-semibold text-[var(--ink)]">Link results later</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Account linking for guest attempts is prepared in the data model. Your teacher can reconcile guest attempts to a student account when feedback is released.
        </p>
        <div className="mt-6 flex gap-3">
          <ButtonLink href="/login" variant="secondary">Log in</ButtonLink>
          <ButtonLink href="/exam">Back to exam entry</ButtonLink>
        </div>
      </Card>
    </main>
  );
}
