import { AppHeader } from "@/components/app-header";
import { Card } from "@/components/ui/card";

export default function DataRetentionPage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-4xl px-5 py-10">
        <h1 className="text-3xl font-semibold text-[var(--ink)]">Data retention</h1>
        <Card className="mt-6 grid gap-4 text-sm leading-7 text-[var(--muted)]">
          <p>Production data should be retained only for assessment administration, marking, review, and audit purposes.</p>
          <p>Deletion must consider both Postgres rows and private Storage objects. Database backups do not automatically remove or back up Storage files.</p>
          <p>Owner retention requests are tracked in the database so deletion and export decisions are auditable.</p>
          <p>Before using Exam Vault for formal school records, define a written retention schedule and backup restoration procedure.</p>
        </Card>
      </main>
    </>
  );
}
