"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Boxes,
  FileText,
  Gauge,
  BarChart3,
  LifeBuoy,
  ListChecks,
  Search,
  ShieldCheck,
  Printer,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Command = {
  href: string;
  label: string;
  section: string;
  keywords: string;
  Icon: LucideIcon;
};

const commands: Command[] = [
  { href: "/owner", label: "Dashboard", section: "Main", keywords: "home overview command center", Icon: Gauge },
  { href: "/owner/assessments", label: "Assessments", section: "Build", keywords: "papers publish review parser", Icon: FileText },
  { href: "/owner/assessments/new", label: "Import PDF/LaTeX", section: "Build", keywords: "create import pdf latex json new assessment", Icon: FileText },
  { href: "/owner/templates", label: "Templates", section: "Build", keywords: "policy presets timing", Icon: Boxes },
  { href: "/owner/paper-generator", label: "Mock Generator", section: "Build", keywords: "mock generator paper generate question library", Icon: Gauge },
  { href: "/owner/question-bank", label: "Question Library", section: "Build", keywords: "question bank reuse extract generator library", Icon: BookOpen },
  { href: "/owner/exam-sessions", label: "Exam Sessions", section: "Run", keywords: "exam code sitting window publish", Icon: Gauge },
  { href: "/owner/operations", label: "Exam-Day Board", section: "Run", keywords: "active attempts incidents upload moderation live", Icon: Gauge },
  { href: "/owner/attempts", label: "Attempts", section: "Run", keywords: "sittings submissions state", Icon: ListChecks },
  { href: "/owner/paper-mode", label: "Paper Mode", section: "Run", keywords: "print booklet scan manual mapping paper marking", Icon: Printer },
  { href: "/owner/marking-queue", label: "Marking Queue", section: "Mark", keywords: "scripts marks queue feedback", Icon: ListChecks },
  { href: "/owner/feedback-releases", label: "Feedback", section: "Mark", keywords: "release marks comments annotated pdf", Icon: FileText },
  { href: "/owner/comment-bank", label: "Rubrics / Feedback Library", section: "Mark", keywords: "comments snippets rubric reusable feedback", Icon: FileText },
  { href: "/owner/analytics", label: "Analytics / Performance", section: "Review", keywords: "performance analytics overview topics error patterns", Icon: BarChart3 },
  { href: "/owner/analytics/cohorts", label: "Group Reporting", section: "Review", keywords: "school cohort class comparison mastery at risk", Icon: BarChart3 },
  { href: "/owner/topics", label: "Topics", section: "Review", keywords: "skills tags calendar weaknesses", Icon: BookOpen },
  { href: "/owner/standards", label: "Curriculum Standards", section: "Review", keywords: "IB MYP IGCSE olympiad standards curriculum skills", Icon: BookOpen },
  { href: "/owner/mistakes", label: "Error Patterns", section: "Review", keywords: "mistakes errors taxonomy patterns", Icon: ListChecks },
  { href: "/owner/revision", label: "Adaptive Revision", section: "Review", keywords: "practice suggested revision weakness standards", Icon: BookOpen },
  { href: "/owner/students", label: "Students", section: "Manage", keywords: "learners accounts login code", Icon: Users },
  { href: "/owner/cohorts", label: "Groups", section: "Manage", keywords: "cohorts groups classes bulk assignment", Icon: Boxes },
  { href: "/owner/security", label: "Security", section: "Manage", keywords: "audit moderation security", Icon: ShieldCheck },
  { href: "/owner/support", label: "Support Console", section: "Manage", keywords: "student support recovery incident upload", Icon: LifeBuoy },
];

export function OwnerCommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.section} ${command.keywords}`.toLowerCase().includes(needle),
    );
  }, [query]);

  return (
    <>
      <Button type="button" variant="ghost" className="hidden h-9 min-w-[220px] justify-start gap-2 text-[var(--muted)] md:inline-flex" onClick={() => setOpen(true)}>
        <Search size={15} aria-hidden="true" />
        Search or jump...
        <kbd className="ml-auto rounded-[2px] border border-[var(--border)] bg-white px-1.5 py-0.5 font-mono text-[10px] text-[var(--subtle)]">Cmd K</kbd>
      </Button>
      {open ? (
        <div className="fixed inset-0 z-[100] bg-black/30 p-4 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-label="Owner command palette">
          <div className="mx-auto mt-20 max-w-2xl overflow-hidden rounded-[4px] border border-[var(--border)] bg-white shadow-[0_18px_60px_rgba(15,23,42,0.22)]">
            <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
              <Search size={18} className="text-[var(--subtle)]" aria-hidden="true" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search pages, operations, and queues"
                className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              <button type="button" className="rounded-[2px] p-2 text-[var(--muted)] hover:bg-[var(--surface-muted)]" onClick={() => setOpen(false)} aria-label="Close command palette">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="max-h-[420px] overflow-y-auto p-2">
              {filtered.map((command) => {
                const CommandIcon = command.Icon;
                return (
                  <Link
                    key={command.href}
                    href={command.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-[3px] px-3 py-2.5 text-sm transition-colors",
                      "hover:bg-[var(--surface-muted)] focus:bg-[var(--surface-muted)] focus:outline-none",
                    )}
                  >
                    <span className="grid size-8 place-items-center rounded-[2px] border border-[var(--border)] bg-white text-[var(--muted)]">
                      <CommandIcon size={16} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-[var(--ink)]">{command.label}</span>
                      <span className="block text-xs text-[var(--muted)]">{command.section}</span>
                    </span>
                  </Link>
                );
              })}
              {!filtered.length ? <p className="px-3 py-8 text-center text-sm text-[var(--muted)]">No matching command.</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
