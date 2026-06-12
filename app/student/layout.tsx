import { Bell, HelpCircle, Search } from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { StudentMobileNav, StudentSidebarNav } from "@/components/student/student-sidebar-nav";
import { IconButton } from "@/components/ui/icon-button";
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
    <div className={`app-shell-grid group has-[.exam-mode]:!grid-cols-1 ${fontSize} ${highContrast} ${lowBandwidth}`}>
      <aside className="hidden min-h-screen border-r border-[rgba(226,232,240,0.1)] bg-[var(--sidebar)] text-white md:flex md:flex-col group-has-[.exam-mode]:!hidden">
        <div className="border-b border-[rgba(226,232,240,0.1)] px-6 py-6">
          <div className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-[2px] bg-[var(--primary)] text-sm font-bold text-white">E</span>
            <div>
              <p className="text-lg font-bold leading-6 tracking-[-0.01em] text-white">Exam Vault</p>
              <p className="text-xs font-semibold tracking-[0.02em] text-[var(--sidebar-muted)]">Student Console</p>
            </div>
          </div>
        </div>
        <div className="flex-1 px-3 py-4">
          <p className="sr-only">Assigned attempts</p>
          <StudentSidebarNav />
        </div>
        <div className="border-t border-[rgba(226,232,240,0.1)] px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-full bg-[#565e74] text-xs font-semibold text-white">{initials(profile?.display_name || "Student")}</span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold tracking-[0.02em] text-white">{profile?.display_name || "Student"}</p>
              <p className="truncate text-[11px] text-[var(--sidebar-muted)]">Student account</p>
            </div>
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-[var(--border)] bg-white px-4 md:px-8 group-has-[.exam-mode]:!hidden">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="md:hidden">
              <StudentMobileNav />
            </div>
            <label className="hidden w-full max-w-md items-center gap-3 rounded-[2px] border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[13px] text-[var(--muted)] md:flex">
              <Search size={15} aria-hidden="true" />
              <span>Search attempts and feedback...</span>
            </label>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <IconButton aria-label="Notifications"><Bell size={16} aria-hidden="true" /></IconButton>
            <IconButton aria-label="Help"><HelpCircle size={16} aria-hidden="true" /></IconButton>
            <div className="hidden h-6 w-px bg-[var(--border)] sm:block" />
            <SignOutButton />
          </div>
        </header>
        <main className="app-page-canvas group-has-[.exam-mode]:!p-0">{children}</main>
      </div>
    </div>
  );
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "ST";
}
