import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/section-heading";
import { getOwnerExamSession } from "@/lib/examsim/session-data";

export default async function OwnerExamSessionSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getOwnerExamSession(id);
  if (!session) notFound();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://examvault.tutor-mcp.com";

  return (
    <>
      <SectionHeading title="Share exam instructions" description="Give students the entry URL and code. The full code is only shown immediately after creation or rotation." />
      <Card>
        <h1 className="text-xl font-semibold text-[var(--ink)]">{session.title}</h1>
        <div className="mt-5 rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
          <p className="text-sm font-semibold text-[var(--ink)]">Student instructions</p>
          <ol className="mt-3 grid gap-2 text-sm leading-6 text-[var(--muted)]">
            <li>1. Go to <code className="font-mono text-[var(--ink)]">{origin}/exam</code>.</li>
            <li>2. Enter the exam code from your teacher.</li>
            <li>3. Enter your name and student number exactly as instructed.</li>
            <li>4. Wait in the lobby until the server opens the exam.</li>
          </ol>
        </div>
        <p className="mt-4 text-sm text-[var(--muted)]">Stored code hint: <span className="font-mono text-[var(--ink)]">{session.code_display_hint ?? "none"}</span></p>
      </Card>
    </>
  );
}
