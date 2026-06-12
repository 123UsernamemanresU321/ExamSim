"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Boxes,
  FileText,
  Gauge,
  LifeBuoy,
  ListChecks,
  Search,
  ShieldCheck,
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
  { href: "/owner/operations", label: "Exam-Day Operations", section: "Operations", keywords: "active attempts incidents upload moderation live", Icon: Gauge },
  { href: "/owner/support", label: "Student Support Console", section: "Operations", keywords: "student support recovery incident upload", Icon: LifeBuoy },
  { href: "/owner/assessments", label: "Assessments", section: "Assessments", keywords: "papers publish review parser", Icon: FileText },
  { href: "/owner/assessments/new", label: "New Assessment", section: "Assessments", keywords: "create import pdf latex json", Icon: FileText },
  { href: "/owner/templates", label: "Templates", section: "Assessments", keywords: "policy presets timing", Icon: Boxes },
  { href: "/owner/question-bank", label: "Question Bank", section: "Assessments", keywords: "reuse extract generator", Icon: BookOpen },
  { href: "/owner/students", label: "Students", section: "People", keywords: "learners accounts login code", Icon: Users },
  { href: "/owner/attempts", label: "Attempts", section: "People", keywords: "sittings submissions state", Icon: ListChecks },
  { href: "/owner/marking-queue", label: "Marking Queue", section: "Marking", keywords: "scripts marks queue feedback", Icon: ListChecks },
  { href: "/owner/feedback-releases", label: "Feedback Releases", section: "Marking", keywords: "release marks comments annotated pdf", Icon: FileText },
  { href: "/owner/security", label: "Security Log", section: "System", keywords: "audit moderation security", Icon: ShieldCheck },
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
