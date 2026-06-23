"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  BarChart3,
  Gauge,
  CalendarClock,
  FileText,
  LifeBuoy,
  LayoutDashboard,
  ShieldCheck,
  Users,
  ChevronDown,
  ChevronRight,
  ListChecks,
  MessageSquareText,
  Tags,
  BookTemplate,
  Boxes,
  Send as SendIcon,
  BookOpen,
  Wand2,
  AlertCircle,
  GraduationCap,
  FileDown,
  Printer,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { filterOwnerNavigationSections } from "@/lib/examsim/institution-route-access";
import { INSTITUTION_PERMISSION_KEYS, type InstitutionPermission } from "@/lib/examsim/institution-role-matrix";

type NavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
  requiredPermission: InstitutionPermission;
};

type NavSection = {
  id: string;
  title: string;
  description: string;
  Icon: LucideIcon;
  items: NavItem[];
};

export const ownerNavSections: NavSection[] = [
  {
    id: "main",
    title: "Dashboard",
    description: "Home and status",
    Icon: LayoutDashboard,
    items: [
      { href: "/owner", label: "Dashboard", Icon: LayoutDashboard, requiredPermission: "student_data" },
    ],
  },
  {
    id: "build",
    title: "Build",
    description: "Author, import, reuse",
    Icon: FileText,
    items: [
      { href: "/owner/assessments", label: "Assessments", Icon: FileText, requiredPermission: "assessment_authoring" },
      { href: "/owner/assessments/new", label: "Import PDF/LaTeX", Icon: FileText, requiredPermission: "assessment_authoring" },
      { href: "/owner/templates", label: "Templates", Icon: BookTemplate, requiredPermission: "assessment_authoring" },
      { href: "/owner/paper-generator", label: "Mock Generator", Icon: Wand2, requiredPermission: "assessment_authoring" },
      { href: "/owner/question-bank", label: "Question Library", Icon: BookOpen, requiredPermission: "assessment_authoring" },
      { href: "/owner/resources", label: "Resource Library", Icon: BookOpen, requiredPermission: "assessment_authoring" },
    ],
  },
  {
    id: "run",
    title: "Run",
    description: "Sessions and delivery",
    Icon: Gauge,
    items: [
      { href: "/owner/exam-sessions", label: "Exam Sessions", Icon: CalendarClock, requiredPermission: "session_publishing" },
      { href: "/owner/operations", label: "Exam-Day Board", Icon: Gauge, requiredPermission: "invigilation" },
      { href: "/owner/attempts", label: "Attempts", Icon: BarChart3, requiredPermission: "student_data" },
      { href: "/owner/paper-mode", label: "Paper Mode", Icon: Printer, requiredPermission: "marking" },
    ],
  },
  {
    id: "mark",
    title: "Mark",
    description: "Marking and release",
    Icon: ListChecks,
    items: [
      { href: "/owner/marking-queue", label: "Marking Queue", Icon: ListChecks, requiredPermission: "marking" },
      { href: "/owner/feedback-releases", label: "Feedback", Icon: SendIcon, requiredPermission: "marking" },
      { href: "/owner/comment-bank", label: "Rubrics / Feedback Library", Icon: MessageSquareText, requiredPermission: "marking" },
    ],
  },
  {
    id: "review",
    title: "Review",
    description: "Performance and patterns",
    Icon: GraduationCap,
    items: [
      { href: "/owner/analytics", label: "Analytics / Performance", Icon: BarChart3, requiredPermission: "analytics" },
      { href: "/owner/export-hub", label: "Export Hub", Icon: FileDown, requiredPermission: "exports" },
      { href: "/owner/topics", label: "Topics", Icon: Tags, requiredPermission: "analytics" },
      { href: "/owner/standards", label: "Curriculum Standards", Icon: GraduationCap, requiredPermission: "analytics" },
      { href: "/owner/mistakes", label: "Error Patterns", Icon: AlertCircle, requiredPermission: "analytics" },
      { href: "/owner/revision", label: "Adaptive Revision", Icon: GraduationCap, requiredPermission: "analytics" },
    ],
  },
  {
    id: "manage",
    title: "Manage",
    description: "People and controls",
    Icon: Users,
    items: [
      { href: "/owner/students", label: "Students", Icon: Users, requiredPermission: "student_management" },
      { href: "/owner/cohorts", label: "Groups", Icon: Boxes, requiredPermission: "student_management" },
      { href: "/owner/security", label: "Security", Icon: ShieldCheck, requiredPermission: "readiness_security" },
      { href: "/owner/support", label: "Support Console", Icon: LifeBuoy, requiredPermission: "student_data" },
    ],
  },
];

export function SidebarNav({
  isCollapsed,
  displayName = "Admin User",
  roleLabel = "System Administrator",
  permissions = INSTITUTION_PERMISSION_KEYS,
}: {
  isCollapsed: boolean;
  onToggle: () => void;
  displayName?: string;
  roleLabel?: string;
  permissions?: readonly InstitutionPermission[];
}) {
  const pathname = usePathname();
  const visibleNavSections = useMemo(() => filterOwnerNavigationSections(ownerNavSections, permissions), [permissions]);
  const activeSectionId = useMemo(() => {
    return visibleNavSections.find((section) => section.items.some((item) => isRouteActive(pathname, item.href)))?.id ?? "main";
  }, [pathname, visibleNavSections]);
  const [manualExpandedSections, setManualExpandedSections] = useState<Set<string>>(() => new Set());
  const expandedSections = useMemo(() => new Set(["main", activeSectionId, ...manualExpandedSections]), [activeSectionId, manualExpandedSections]);

  function toggleSection(sectionId: string) {
    setManualExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(sectionId) && sectionId !== activeSectionId && sectionId !== "main") next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  return (
    <aside 
      className={cn(
        "relative hidden min-h-screen border-r border-[rgba(226,232,240,0.1)] bg-[var(--sidebar)] text-white transition-[width] duration-200 md:flex md:flex-col",
        isCollapsed ? "w-16" : "w-[260px]"
      )}
      aria-label="Owner navigation"
    >
      <div className={cn("border-b border-[rgba(226,232,240,0.1)]", isCollapsed ? "px-2 py-4" : "px-6 py-6")}>
        {!isCollapsed && (
          <div className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-[2px] bg-[var(--primary)] text-sm font-bold text-white">E</span>
            <div>
              <p className="text-lg font-bold leading-6 tracking-[-0.01em] text-white">Exam Vault</p>
              <p className="text-xs font-semibold tracking-[0.02em] text-[var(--sidebar-muted)]">Institutional Security</p>
            </div>
          </div>
        )}
        {isCollapsed ? <span className="mx-auto grid size-8 place-items-center rounded-[2px] bg-[var(--primary)] text-sm font-bold text-white">E</span> : null}
      </div>

      <nav className={cn("flex-1 text-xs font-semibold", isCollapsed ? "grid content-start gap-2 px-2 py-4" : "space-y-1 overflow-y-auto px-3 py-4")}>
        {isCollapsed ? (
          visibleNavSections.map((section) => (
            <div key={section.id} className="grid gap-1 border-b border-[rgba(226,232,240,0.1)] pb-2 last:border-b-0" aria-label={section.title}>
              {section.items.map(({ href, label, Icon }) => {
                const isActive = isRouteActive(pathname, href);
                return (
                  <Link
                    key={href}
                    className={cn(
                      "flex size-12 items-center justify-center rounded-[4px] transition-colors",
                      isActive ? "bg-[var(--sidebar-active)] text-white" : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-active)] hover:text-white",
                    )}
                    href={href}
                    title={label}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span className="sr-only">{label}</span>
                  </Link>
                );
              })}
            </div>
          ))
        ) : (
          visibleNavSections.map((section) => {
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
                  aria-controls={`owner-nav-section-${section.id}`}
                  onClick={() => toggleSection(section.id)}
                  title={section.description}
                >
                  <span className="flex size-5 items-center justify-center">
                    <SectionIcon size={16} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold tracking-[0.02em]">{section.title}</span>
                  </span>
                  {isExpanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
                </button>

                {isExpanded ? (
                  <div id={`owner-nav-section-${section.id}`} className="mt-1 grid gap-1 pl-8">
                    {section.items.map(({ href, label, Icon }) => {
                      const isActive = isRouteActive(pathname, href);
                      return (
                        <Link
                          key={href}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] transition-colors",
                            isActive ? "bg-[var(--sidebar-active)] text-white" : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-active)] hover:text-white",
                          )}
                          href={href}
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
          })
        )}
      </nav>
      {!isCollapsed ? (
        <div className="border-t border-[rgba(226,232,240,0.1)] px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-full bg-[#565e74] text-xs font-semibold text-white">{initials(displayName)}</span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold tracking-[0.02em] text-white">{displayName}</p>
              <p className="truncate text-[11px] text-[var(--sidebar-muted)]">{roleLabel}</p>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

export function OwnerMobileNav({ permissions = INSTITUTION_PERMISSION_KEYS }: { permissions?: readonly InstitutionPermission[] }) {
  const pathname = usePathname();
  const visibleNavSections = useMemo(() => filterOwnerNavigationSections(ownerNavSections, permissions), [permissions]);
  const activeSection = visibleNavSections.find((section) => section.items.some((item) => isRouteActive(pathname, item.href)));
  const activeItem = activeSection?.items.find((item) => isRouteActive(pathname, item.href));

  return (
    <details className="rounded-[4px] border border-[var(--border)] bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[var(--ink)] [&::-webkit-details-marker]:hidden">
        <span>{activeItem?.label ?? "Owner navigation"}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <nav className="grid gap-3 border-t border-[var(--border)] p-3 text-sm" aria-label="Owner mobile navigation">
        {visibleNavSections.map((section) => (
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

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "AD";
}

function isRouteActive(pathname: string, href: string) {
  if (pathname === "/owner/assessments/new") return href === "/owner/assessments/new";
  return href === "/owner" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}
