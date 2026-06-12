"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  BarChart3, 
  FileText, 
  LayoutDashboard, 
  ShieldCheck, 
  Users, 
  ChevronLeft, 
  ChevronDown,
  ChevronRight,
  Menu,
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
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type NavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
};

type NavSection = {
  id: string;
  title: string;
  description: string;
  Icon: LucideIcon;
  items: NavItem[];
};

const ownerNavSections: NavSection[] = [
  {
    id: "main",
    title: "Main",
    description: "Home and status",
    Icon: LayoutDashboard,
    items: [
      { href: "/owner", label: "Dashboard", Icon: LayoutDashboard },
    ],
  },
  {
    id: "assessments",
    title: "Assessments",
    description: "Create, review, reuse",
    Icon: FileText,
    items: [
      { href: "/owner/assessments", label: "Assessments", Icon: FileText },
      { href: "/owner/templates", label: "Templates", Icon: BookTemplate },
      { href: "/owner/question-bank", label: "Question Bank", Icon: BookOpen },
      { href: "/owner/paper-generator", label: "Generator", Icon: Wand2 },
    ],
  },
  {
    id: "students",
    title: "Students & attempts",
    description: "People, cohorts, sittings",
    Icon: Users,
    items: [
      { href: "/owner/students", label: "Students", Icon: Users },
      { href: "/owner/cohorts", label: "Cohorts", Icon: Boxes },
      { href: "/owner/attempts", label: "Attempts", Icon: BarChart3 },
    ],
  },
  {
    id: "marking",
    title: "Marking & feedback",
    description: "Queue, release, snippets",
    Icon: ListChecks,
    items: [
      { href: "/owner/marking-queue", label: "Marking Queue", Icon: ListChecks },
      { href: "/owner/feedback-releases", label: "Feedback", Icon: SendIcon },
      { href: "/owner/comment-bank", label: "Comments", Icon: MessageSquareText },
    ],
  },
  {
    id: "learning",
    title: "Learning tools",
    description: "Topics and mistakes",
    Icon: GraduationCap,
    items: [
      { href: "/owner/topics", label: "Topics", Icon: Tags },
      { href: "/owner/mistakes", label: "Mistakes", Icon: AlertCircle },
    ],
  },
  {
    id: "system",
    title: "System",
    description: "Security controls",
    Icon: ShieldCheck,
    items: [
      { href: "/owner/security", label: "Security", Icon: ShieldCheck },
    ],
  },
];

export function SidebarNav({ isCollapsed, onToggle }: { isCollapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const activeSectionId = useMemo(() => {
    return ownerNavSections.find((section) => section.items.some((item) => isRouteActive(pathname, item.href)))?.id ?? "main";
  }, [pathname]);
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
        "relative hidden border-r border-[var(--border)] bg-[var(--surface-muted)] transition-[width] duration-200 md:block",
        isCollapsed ? "w-16" : "w-60 px-3 py-5"
      )}
      aria-label="Owner navigation"
    >
      <div className={cn("flex items-center justify-between mb-8", isCollapsed ? "flex-col gap-4 px-2 py-4" : "px-3")}>
        {!isCollapsed && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--subtle)]">Owner</p>
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={onToggle}
          className={cn("h-8 w-8 rounded-md p-0 hover:bg-white", isCollapsed && "mt-2")}
        >
          {isCollapsed ? <Menu size={16} /> : <ChevronLeft size={16} />}
        </Button>
      </div>

      <nav className={cn("text-sm font-semibold text-[var(--muted)]", isCollapsed ? "grid gap-2 px-2" : "space-y-1.5 overflow-y-auto pb-10")}>
        {isCollapsed ? (
          ownerNavSections.map((section) => (
            <div key={section.id} className="grid gap-1 border-b border-[var(--border)] pb-2 last:border-b-0" aria-label={section.title}>
              {section.items.map(({ href, label, Icon }) => {
                const isActive = isRouteActive(pathname, href);
                return (
                  <Link
                    key={href}
                    className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-md transition-colors",
                      isActive ? "bg-white text-[var(--primary)] shadow-sm" : "text-[var(--muted)] hover:bg-white hover:text-[var(--primary)]",
                    )}
                    href={href}
                    title={label}
                  >
                    <Icon size={20} aria-hidden="true" className={cn(isActive ? "text-[var(--primary)]" : "text-[var(--subtle)]")} />
                    <span className="sr-only">{label}</span>
                  </Link>
                );
              })}
            </div>
          ))
        ) : (
          ownerNavSections.map((section) => {
            const isExpanded = expandedSections.has(section.id);
            const sectionActive = section.id === activeSectionId;
            const SectionIcon = section.Icon;
            return (
              <section key={section.id} className="rounded-lg">
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition hover:bg-white",
                    sectionActive ? "text-[var(--ink)]" : "text-[var(--muted)]",
                  )}
                  aria-expanded={isExpanded}
                  aria-controls={`owner-nav-section-${section.id}`}
                  onClick={() => toggleSection(section.id)}
                  title={section.description}
                >
                  <span className={cn("flex h-7 w-7 items-center justify-center rounded-md", sectionActive ? "bg-[var(--primary)] !text-white" : "bg-white text-[var(--subtle)]")}>
                    <SectionIcon size={16} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold uppercase tracking-[0.12em]">{section.title}</span>
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
                            isActive ? "bg-white text-[var(--primary)] shadow-sm" : "text-[var(--muted)] hover:bg-white hover:text-[var(--primary)]",
                          )}
                          href={href}
                        >
                          <Icon size={15} aria-hidden="true" className={cn(isActive ? "text-[var(--primary)]" : "text-[var(--subtle)]")} />
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
    </aside>
  );
}

export function OwnerMobileNav() {
  const pathname = usePathname();
  const activeSection = ownerNavSections.find((section) => section.items.some((item) => isRouteActive(pathname, item.href)));
  const activeItem = activeSection?.items.find((item) => isRouteActive(pathname, item.href));

  return (
    <details className="rounded-lg border border-[var(--border)] bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[var(--ink)] [&::-webkit-details-marker]:hidden">
        <span>{activeItem?.label ?? "Owner navigation"}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <nav className="grid gap-3 border-t border-[var(--border)] p-3 text-sm" aria-label="Owner mobile navigation">
        {ownerNavSections.map((section) => (
          <section key={section.id}>
            <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--subtle)]">{section.title}</p>
            <div className="grid gap-1">
              {section.items.map(({ href, label, Icon }) => {
                const isActive = isRouteActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2.5 py-2 font-semibold transition-colors",
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
  return href === "/owner" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}
