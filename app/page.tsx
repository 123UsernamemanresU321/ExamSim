import { ArrowRight, FileLock2, ShieldCheck, TimerReset, UploadCloud } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-header";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getCurrentUserProfile } from "@/lib/auth/server";

export default async function HomePage() {
  const { user, profile } = await getCurrentUserProfile();
  const landingActions = getLandingActions(user !== null, profile?.app_role ?? null);

  return (
    <>
      <AppHeader />
      <main>
        <section className="page-container grid gap-8 py-10 md:min-h-[calc(100vh-64px)] md:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.75fr)] md:items-center">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-[2px] border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
              <ShieldCheck size={15} aria-hidden="true" />
              Server-authoritative exam operations
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.02em] text-[var(--ink)] md:text-6xl">
              Secure, institutional-grade timed exam simulation.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--muted)] md:text-lg">
              Exam Vault is built for tutors and schools that need private assessment delivery, root-question uploads, annotation,
              release-controlled feedback, and moderation evidence without making the browser the source of truth.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              {landingActions.map((action) => (
                <ButtonLink key={action.href} href={action.href} variant={action.variant}>
                  {action.label}
                  <ArrowRight size={16} aria-hidden="true" />
                </ButtonLink>
              ))}
            </div>
            {user ? (
              <p className="mt-4 text-sm text-[var(--muted)]">
                Signed in as <span className="font-semibold text-[var(--ink)]">{profile?.display_name ?? user.email ?? "an Exam Vault user"}</span>.
              </p>
            ) : null}
          </div>
          <Card className="overflow-hidden p-0">
            <div className="border-b border-[var(--border)] bg-[var(--sidebar)] px-5 py-4 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Operational gateway</p>
              <h2 className="mt-2 text-xl font-semibold">What the server controls</h2>
            </div>
            <div className="grid gap-0 divide-y divide-[var(--border)]">
              <GatewayRow icon={<TimerReset size={18} />} title="Attempt state and timing" copy="Countdowns are display-only; server state decides WAITING, ACTIVE, UPLOAD_ONLY, and review access." />
              <GatewayRow icon={<FileLock2 size={18} />} title="Private packages and files" copy="Source PDFs, exam packages, uploads, marking packets, and annotated PDFs remain in private buckets and private storage." />
              <GatewayRow icon={<UploadCloud size={18} />} title="Root-question submissions" copy="Students upload one PDF per main question, while subquestions keep separate marks and feedback." />
            </div>
          </Card>
        </section>
        <section className="border-t border-[var(--border)] bg-[var(--surface-panel)]">
          <div className="page-container flex flex-col gap-3 py-6 text-sm text-[var(--muted)] md:flex-row md:items-center md:justify-between">
            <p>Browser Mode is tamper-evident, not tamper-proof. Moderation signals require review.</p>
            <div className="flex flex-wrap gap-3">
              <Link className="font-semibold text-[var(--primary)]" href="/browser-mode">Browser Mode</Link>
              <Link className="font-semibold text-[var(--primary)]" href="/privacy">Privacy</Link>
              <Link className="font-semibold text-[var(--primary)]" href="/terms">Terms</Link>
              <Link className="font-semibold text-[var(--primary)]" href="/data-retention">Retention</Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

function GatewayRow({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) {
  return (
    <div className="flex gap-4 p-5">
      <span className="grid size-9 shrink-0 place-items-center rounded-[2px] border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--primary)]">{icon}</span>
      <div>
        <h3 className="text-sm font-semibold text-[var(--ink)]">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{copy}</p>
      </div>
    </div>
  );
}

function getLandingActions(isSignedIn: boolean, role: "owner" | "student" | null): Array<{ href: string; label: string; variant?: "primary" | "secondary" }> {
  if (!isSignedIn) {
    return [
      { href: "/login", label: "Log in" },
      { href: "/activate", label: "Activate student account", variant: "secondary" },
    ];
  }
  if (role === "owner") return [{ href: "/owner", label: "Go to Owner Dashboard" }];
  if (role === "student") return [{ href: "/student/command-center", label: "Go to Student Command Center" }];
  return [{ href: "/login", label: "Continue setup" }];
}
