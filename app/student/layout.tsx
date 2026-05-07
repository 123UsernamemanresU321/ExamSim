import { AppHeader } from "@/components/app-header";
import { ClipboardList, Home, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { requireAppRole } from "@/lib/auth/server";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  await requireAppRole("student", "/student");

  // On exam pages, we want to maximize screen space and avoid navigation distractions.
  return (
    <>
      <AppHeader />
      <div className="app-shell-grid group has-[.exam-mode]:!grid-cols-1">
        <aside className="hidden border-r border-[var(--border)] bg-[var(--surface-muted)] px-4 py-6 md:block group-has-[.exam-mode]:!hidden" aria-label="Student navigation">
          <p className="mb-4 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--subtle)]">Student</p>
          <nav className="grid gap-1 text-sm font-semibold text-[var(--muted)]">
            <Link className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-white" href="/student">
              <Home size={17} aria-hidden="true" />
              Dashboard
            </Link>
            <Link className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-white" href="/student">
              <ClipboardList size={17} aria-hidden="true" />
              Assigned attempts
            </Link>
            <Link className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-white" href="/student/security">
              <ShieldCheck size={17} aria-hidden="true" />
              Security
            </Link>
          </nav>
        </aside>
        <main className="min-w-0 px-5 py-8 md:px-8">{children}</main>
      </div>
    </>
  );
}
