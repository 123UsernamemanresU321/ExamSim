import { AppHeader } from "@/components/app-header";
import { BarChart3, FileText, LayoutDashboard, Users } from "lucide-react";

const ownerNav = [
  { href: "/owner", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/owner/assessments", label: "Assessments", Icon: FileText },
  { href: "/owner/students", label: "Students", Icon: Users },
  { href: "/owner/attempts", label: "Attempts", Icon: BarChart3 },
];

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <div className="app-shell-grid">
        <aside className="hidden border-r border-[var(--border)] bg-[var(--surface-muted)] px-4 py-6 md:block" aria-label="Owner navigation">
          <p className="mb-4 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--subtle)]">Owner</p>
          <nav className="grid gap-1 text-sm font-semibold text-[var(--muted)]">
            {ownerNav.map(({ href, label, Icon }) => (
              <a key={href} className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-white" href={href}>
                <Icon size={17} aria-hidden="true" />
                {label}
              </a>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 px-5 py-8 md:px-8">{children}</main>
      </div>
    </>
  );
}
