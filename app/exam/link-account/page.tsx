import { StudentAttemptClaimForm } from "@/components/exam/student-attempt-claim-form";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireAppRole } from "@/lib/auth/server";

export default async function GuestLinkAccountPage() {
  await requireAppRole("student", "/exam/link-account");
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-4 py-10">
      <Card className="max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">Student results</p>
        <h1 className="mt-3 text-2xl font-semibold text-[var(--ink)]">Claim a returned exam</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Claim codes are issued after marking and feedback release. A code can be used once and does not replace your
          exam code, student number, or account password.
        </p>
        <StudentAttemptClaimForm />
        <div className="mt-4 flex gap-3 border-t border-[var(--border)] pt-4">
          <ButtonLink href="/student/results" variant="secondary">View my results</ButtonLink>
          <ButtonLink href="/exam" variant="ghost">Back to exam entry</ButtonLink>
        </div>
      </Card>
    </main>
  );
}
