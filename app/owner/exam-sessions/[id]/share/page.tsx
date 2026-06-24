import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeading } from "@/components/section-heading";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { getOwnerExamSession } from "@/lib/examsim/session-data";

export default async function OwnerExamSessionSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getOwnerExamSession(id);
  if (!session) notFound();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://examvault.tutor-mcp.com";

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Exam Sessions", href: "/owner/exam-sessions" },
          { label: session.title, href: `/owner/exam-sessions/${id}` },
          { label: "Share Instructions" },
        ]}
      />
      <SectionHeading title="Share exam instructions" description="Give students the entry URL and code. The full code is only shown immediately after creation or rotation." />
      <Card>
        <h1 className="text-xl font-semibold text-[var(--ink)]">{session.title}</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          <ButtonLink href="/exam" target="_blank" rel="noreferrer">Preview Student Exam Entry</ButtonLink>
          <ButtonLink href="/owner/students" variant="secondary">Manage Student Numbers</ButtonLink>
        </div>
        <div className="mt-5 rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
          <p className="text-sm font-semibold text-[var(--ink)]">Student instructions</p>
          <ol className="mt-3 grid gap-2 text-sm leading-6 text-[var(--muted)]">
            <li>1. Go to <code className="font-mono text-[var(--ink)]">{origin}/exam</code>.</li>
            <li>2. Enter the exam code from your teacher.</li>
            <li>3. Enter your student number and name exactly as instructed. Student numbers look like <code className="font-mono text-[var(--ink)]">DP1-007</code> or <code className="font-mono text-[var(--ink)]">E001</code>.</li>
            <li>4. Wait in the lobby until the server opens the exam.</li>
          </ol>
        </div>
        <div className="mt-4 rounded-[4px] border border-blue-100 bg-blue-50/50 p-4 text-sm leading-6 text-blue-950">
          <p className="font-semibold">Exam code and student number are different.</p>
          <p className="mt-1">The exam code opens this session. The student number identifies the student on your roster and is not a password. Student accounts are only needed later for released results, marked papers, and history.</p>
        </div>
        <p className="mt-4 text-sm text-[var(--muted)]">Stored code hint: <span className="font-mono text-[var(--ink)]">{session.code_display_hint ?? "none"}</span></p>
      </Card>
    </>
  );
}
