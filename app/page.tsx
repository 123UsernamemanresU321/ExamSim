import type { LucideIcon } from "lucide-react";
import { BookOpen, FileLock2, ShieldCheck, TimerReset } from "lucide-react";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getCurrentUserProfile } from "@/lib/auth/server";

const featureCards: { title: string; Icon: LucideIcon; copy: string }[] = [
  {
    title: "Server timing",
    Icon: TimerReset,
    copy: "The browser displays countdowns; Edge Functions decide state.",
  },
  {
    title: "Private content",
    Icon: FileLock2,
    copy: "Sources, packages, uploads, and marking packets stay in private buckets.",
  },
  {
    title: "Academic delivery",
    Icon: BookOpen,
    copy: "A4-style canvas, KaTeX math, upload slots, and moderation evidence.",
  },
];

export default async function HomePage() {
  const { user, profile } = await getCurrentUserProfile();
  const landingActions = getLandingActions(user !== null, profile?.app_role ?? null);

  return (
    <>
      <AppHeader />
      <main>
        <section className="mx-auto grid max-w-[1440px] gap-10 px-5 py-14 md:min-h-[calc(100vh-64px)] md:grid-cols-[1fr_0.92fr] md:items-center md:py-10">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
              <ShieldCheck size={15} aria-hidden="true" />
              Browser Mode MVP
            </div>
            <h1 className="paper-body max-w-3xl text-5xl font-semibold leading-[0.98] text-[var(--ink)] md:text-7xl">
              Secure, institutional-grade timed exam simulation.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--muted)]">
              Exam Vault gives a single owner controlled assessment ingestion, private storage, timed release,
              student uploads, telemetry evidence, and marking review without pretending the browser is locked down.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {landingActions.map((action) => (
                <ButtonLink key={action.href} href={action.href} variant={action.variant}>
                  {action.label}
                </ButtonLink>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4 shadow-[var(--shadow)]">
            <div className="paper-sheet paper-body rounded-md border border-[var(--border)] px-6 py-8">
              <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-[var(--subtle)]">
                Locked assessment preview
              </p>
              <h2 className="mt-5 text-3xl font-semibold text-[var(--ink)]">Olympiad Mock Paper 1</h2>
              <p className="mt-4 text-base leading-7 text-[var(--muted)]">
                Content is not loaded before the server-authoritative start time. Students see metadata,
                instructions, and a countdown only.
              </p>
              <div className="mt-8 grid grid-cols-3 gap-3 text-center font-mono text-[var(--primary)]">
                <span className="rounded-md border border-[var(--border)] bg-white py-3 text-2xl">00</span>
                <span className="rounded-md border border-[var(--border)] bg-white py-3 text-2xl">42</span>
                <span className="rounded-md border border-[var(--border)] bg-white py-3 text-2xl">19</span>
              </div>
            </div>
          </div>
        </section>
        <section className="border-t border-[var(--border)] bg-white">
          <div className="mx-auto max-w-[1440px] px-5 py-12">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--subtle)]">
              Architected for defense
            </h2>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {featureCards.map(({ title, Icon, copy }) => (
                <Card key={title} className="shadow-none">
                  <Icon className="mb-4 text-[var(--primary)]" size={24} aria-hidden="true" />
                  <h3 className="text-lg font-semibold text-[var(--ink)]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{copy}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>
        <section className="border-t border-[var(--border)] bg-[var(--surface-panel)]">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-5 py-6 text-sm text-[var(--muted)] md:flex-row md:items-center md:justify-between">
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
