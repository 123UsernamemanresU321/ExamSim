import { AppHeader } from "@/components/app-header";
import { ClipboardList, Home, ShieldCheck } from "lucide-react";
import Link from "next/link";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <div className="app-shell-grid">
        <aside className="hidden border-r border-[var(--border)] bg-[var(--surface-muted)] px-4 py-6 md:block" aria-label="Student navigation">
          <p className="mb-4 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--subtle)]">Student</p>
          <nav className="grid gap-1 text-sm font-semibold text-[var(--muted)]">
            <Link className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-white" href="/student">
              <Home size={17} aria-hidden="true" />
              Dashboard
            </Link>
            <Link className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-white" href="/student">
              <ClipboardList size={17} aria-hidden="true" />
              Assignments
            </Link>
            <Link className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-white" href="/student/attempts/att_active/exam">
              <ShieldCheck size={17} aria-hidden="true" />
              Active exam
            </Link>
          </nav>
        </aside>
        <main className="min-w-0 px-5 py-8 md:px-8">{children}</main>
      </div>
    </>
  );
}
