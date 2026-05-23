import { AppHeader } from "@/components/app-header";
import {
  Archive,
  Bell,
  CalendarDays,
  Gauge,
  Home,
  Inbox,
  Laptop,
  LineChart,
  ShieldCheck,
  SlidersHorizontal,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { requireAppRole } from "@/lib/auth/server";
import { getStudentSettingsData } from "@/lib/student-experience";

const navSections: Array<{
  title: string;
  items: Array<{ href: string; label: string; Icon: LucideIcon }>;
}> = [
  {
    title: "Exams",
    items: [
      { href: "/student/command-center", label: "Command Center", Icon: Home },
      { href: "/student/timeline", label: "Timeline", Icon: CalendarDays },
      { href: "/student/archive", label: "Archive", Icon: Archive },
    ],
  },
  {
    title: "Feedback",
    items: [
      { href: "/student/feedback", label: "Feedback", Icon: Inbox },
      { href: "/student/progress", label: "Progress", Icon: LineChart },
      { href: "/student/mistake-patterns", label: "Mistake Patterns", Icon: Target },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/student/devices", label: "Devices", Icon: Laptop },
      { href: "/student/accessibility", label: "Accessibility", Icon: SlidersHorizontal },
      { href: "/student/security", label: "Security", Icon: ShieldCheck },
      { href: "/student/notification-settings", label: "Notification Settings", Icon: Bell },
    ],
  },
];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireAppRole("student", "/student");
  const settings = profile ? await getStudentSettingsData(profile.id) : null;
  const preferences = settings?.accessibilityPreferences?.preferences_json;
  const preferenceRecord = preferences && typeof preferences === "object" && !Array.isArray(preferences) ? preferences as Record<string, unknown> : {};
  const fontSize = preferenceRecord.interface_font_size === "large" ? "student-font-large" : preferenceRecord.interface_font_size === "extra_large" ? "student-font-xl" : "";
  const highContrast = preferenceRecord.high_contrast === true ? "student-high-contrast" : "";
  const lowBandwidth = settings?.performancePreferences?.low_bandwidth_mode ? "student-low-bandwidth" : "";

  // On exam pages, we want to maximize screen space and avoid navigation distractions.
  return (
    <>
      <AppHeader />
      <div className={`app-shell-grid group has-[.exam-mode]:!grid-cols-1 ${fontSize} ${highContrast} ${lowBandwidth}`}>
        <aside className="hidden border-r border-[var(--border)] bg-[var(--surface-muted)] px-4 py-6 md:block group-has-[.exam-mode]:!hidden" aria-label="Student navigation">
          <p className="mb-4 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--subtle)]">Student</p>
          <nav className="grid gap-5 text-sm font-semibold text-[var(--muted)]">
            {navSections.map((section) => (
              <div key={section.title}>
                <p className="mb-2 flex items-center gap-2 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--subtle)]">
                  {section.title === "Exams" ? <Gauge size={13} aria-hidden="true" /> : null}
                  {section.title}
                </p>
                <div className="grid gap-1">
                  {section.items.map(({ href, label, Icon }) => (
                    <Link
                      key={href}
                      className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-white"
                      href={href}
                      title={label === "Command Center" ? "Assigned attempts" : undefined}
                    >
                      <Icon size={17} aria-hidden="true" />
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 px-5 py-8 md:px-8">{children}</main>
      </div>
    </>
  );
}
