import { AppHeader } from "@/components/app-header";
import { StudentSidebarNav } from "@/components/student/student-sidebar-nav";
import { requireAppRole } from "@/lib/auth/server";
import { getStudentSettingsData } from "@/lib/student-experience";

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
        <aside className="hidden border-r border-[var(--border)] bg-[var(--surface-muted)] px-3 py-5 md:block group-has-[.exam-mode]:!hidden">
          <p className="mb-4 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--subtle)]">Student</p>
          <p className="sr-only">Assigned attempts</p>
          <StudentSidebarNav />
        </aside>
        <main className="min-w-0 px-5 py-8 md:px-8">{children}</main>
      </div>
    </>
  );
}
