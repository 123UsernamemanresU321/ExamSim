import { AppHeader } from "@/components/app-header";
import { Card } from "@/components/ui/card";

export default function TermsPage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-4xl px-5 py-10">
        <h1 className="text-3xl font-semibold text-[var(--ink)]">Terms</h1>
        <Card className="mt-6 grid gap-4 text-sm leading-7 text-[var(--muted)]">
          <p>Exam Vault provides timed assessment simulation and marking workflows for owner-managed students.</p>
          <p>Browser Mode is tamper-evident, not tamper-proof. Moderation events are signals for review and must not be treated as automatic proof of misconduct.</p>
          <p>The owner is responsible for lawful use, student consent where required, assessment rights, and retention decisions.</p>
          <p>Students must follow assessment instructions and submit only permitted PDF or typed responses during server-allowed windows.</p>
        </Card>
      </main>
    </>
  );
}
