import { ExamCodeEntryForm } from "@/components/exam/exam-code-entry-form";
import { Card } from "@/components/ui/card";

export default function ExamEntryPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-10">
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="self-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">Exam Vault</p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-[-0.02em] text-[var(--ink)] md:text-5xl">
            Enter Exam Code
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[var(--muted)]">
            Use the exam code given by your teacher. After the code is verified, you will enter your student number and name so your work can be matched to the roster.
          </p>
          <div className="mt-8 grid gap-3 text-sm text-[var(--muted)] sm:grid-cols-3">
            <Info label="Server controlled" value="Exam timing" />
            <Info label="Private" value="Uploads and scripts" />
            <Info label="Optional" value="Results account" />
          </div>
        </section>
        <Card className="self-center">
          <h2 className="text-xl font-semibold text-[var(--ink)]">Enter Exam Code</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Use the exam code given by your teacher, for example <code className="font-mono text-[var(--ink)]">CHEM-P2-047</code>.
          </p>
          <div className="mt-6">
            <ExamCodeEntryForm />
          </div>
        </Card>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[4px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-card)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 font-semibold text-[var(--ink)]">{value}</p>
    </div>
  );
}
