"use client";

import {
  Archive,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Gauge,
  Home,
  Inbox,
  Laptop,
  LineChart,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type StudentNavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
};

type StudentNavSection = {
  id: string;
  title: string;
  Icon: LucideIcon;
  items: StudentNavItem[];
};

const studentNavSections: StudentNavSection[] = [
  {
    id: "exams",
    title: "Exams",
    Icon: Gauge,
    items: [
      { href: "/student/command-center", label: "Command Center", Icon: Home },
      { href: "/student/timeline", label: "Timeline", Icon: CalendarDays },
      { href: "/student/archive", label: "Archive", Icon: Archive },
    ],
  },
  {
    id: "feedback",
    title: "Feedback",
    Icon: Inbox,
    items: [
      { href: "/student/feedback", label: "Inbox", Icon: Inbox },
      { href: "/student/progress", label: "Progress", Icon: LineChart },
      { href: "/student/mistake-patterns", label: "Mistake Patterns", Icon: Target },
    ],
  },
  {
    id: "settings",
    title: "Account",
    Icon: ShieldCheck,
    items: [
      { href: "/student/devices", label: "Devices", Icon: Laptop },
      { href: "/student/accessibility", label: "Accessibility", Icon: SlidersHorizontal },
      { href: "/student/security", label: "Security", Icon: ShieldCheck },
      { href: "/student/notification-settings", label: "Notifications", Icon: Bell },
    ],
  },
];

export function StudentSidebarNav() {
  const pathname = usePathname();
  const activeSectionId = useMemo(
    () => studentNavSections.find((section) => section.items.some((item) => isRouteActive(pathname, item.href)))?.id ?? "exams",
    [pathname],
  );
  const [manualExpandedSections, setManualExpandedSections] = useState<Set<string>>(() => new Set());
  const expandedSections = useMemo(() => new Set(["exams", activeSectionId, ...manualExpandedSections]), [activeSectionId, manualExpandedSections]);

  function toggleSection(sectionId: string) {
    setManualExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(sectionId) && sectionId !== activeSectionId && sectionId !== "exams") next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  return (
    <nav className="grid gap-1 text-xs font-semibold" aria-label="Student navigation">
      {studentNavSections.map((section) => {
        const isExpanded = expandedSections.has(section.id);
        const sectionActive = section.id === activeSectionId;
        const SectionIcon = section.Icon;
        return (
          <section key={section.id}>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-3 rounded-[4px] px-3 py-2 text-left transition-colors hover:bg-[var(--sidebar-active)] hover:text-white",
                sectionActive ? "text-white" : "text-[var(--sidebar-muted)]",
              )}
              aria-expanded={isExpanded}
              aria-controls={`student-nav-section-${section.id}`}
              onClick={() => toggleSection(section.id)}
            >
              <span className="flex size-5 items-center justify-center">
                <SectionIcon size={15} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold tracking-[0.02em]">{section.title}</span>
              {isExpanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
            </button>
            {isExpanded ? (
              <div id={`student-nav-section-${section.id}`} className="mt-1 grid gap-1 pl-8">
                {section.items.map(({ href, label, Icon }) => {
                  const isActive = isRouteActive(pathname, href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        "flex items-center gap-2 rounded-[4px] px-2.5 py-2 text-[13px] transition-colors",
                        isActive ? "bg-[var(--sidebar-active)] text-white" : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-active)] hover:text-white",
                      )}
                    >
                      <Icon size={15} aria-hidden="true" />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </section>
        );
      })}
    </nav>
  );
}

export function StudentMobileNav() {
  const pathname = usePathname();
  const activeSection = studentNavSections.find((section) => section.items.some((item) => isRouteActive(pathname, item.href)));
  const activeItem = activeSection?.items.find((item) => isRouteActive(pathname, item.href));

  return (
    <details className="rounded-[4px] border border-[var(--border)] bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[var(--ink)] [&::-webkit-details-marker]:hidden">
        <span>{activeItem?.label ?? "Student navigation"}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <nav className="grid gap-3 border-t border-[var(--border)] p-3 text-sm" aria-label="Student mobile navigation">
        {studentNavSections.map((section) => (
          <section key={section.id}>
            <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">{section.title}</p>
            <div className="grid gap-1">
              {section.items.map(({ href, label, Icon }) => {
                const isActive = isRouteActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-2 rounded-[2px] px-2.5 py-2 font-semibold transition-colors",
                      isActive ? "bg-[var(--surface-muted)] text-[var(--primary)]" : "text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--primary)]",
                    )}
                  >
                    <Icon size={16} aria-hidden="true" />
                    {label}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </nav>
    </details>
  );
}

function isRouteActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}
