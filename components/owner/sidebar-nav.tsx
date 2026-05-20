"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  BarChart3, 
  FileText, 
  LayoutDashboard, 
  ShieldCheck, 
  Users, 
  ChevronLeft, 
  Menu,
  ListChecks,
  MessageSquareText,
  Tags,
  BookTemplate,
  Boxes,
  Send as SendIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const ownerNav = [
  { href: "/owner", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/owner/assessments", label: "Assessments", Icon: FileText },
  { href: "/owner/students", label: "Students", Icon: Users },
  { href: "/owner/attempts", label: "Attempts", Icon: BarChart3 },
  { href: "/owner/marking-queue", label: "Marking Queue", Icon: ListChecks },
  { href: "/owner/feedback-releases", label: "Feedback", Icon: SendIcon },
  { href: "/owner/comment-bank", label: "Comments", Icon: MessageSquareText },
  { href: "/owner/topics", label: "Topics", Icon: Tags },
  { href: "/owner/templates", label: "Templates", Icon: BookTemplate },
  { href: "/owner/cohorts", label: "Cohorts", Icon: Boxes },
  { href: "/owner/security", label: "Security", Icon: ShieldCheck },
];

export function SidebarNav({ isCollapsed, onToggle }: { isCollapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();

  return (
    <aside 
      className={cn(
        "hidden border-r border-[var(--border)] bg-[var(--surface-muted)] transition-all duration-300 md:block relative",
        isCollapsed ? "w-16" : "w-64 px-4 py-6"
      )}
      aria-label="Owner navigation"
    >
      <div className={cn("flex items-center justify-between mb-8", isCollapsed ? "flex-col gap-4 px-2 py-4" : "px-3")}>
        {!isCollapsed && <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--subtle)]">System</p>}
        <Button
          variant="ghost"
          onClick={onToggle}
          className={cn("h-8 w-8 p-0 hover:bg-white/50 rounded-full", isCollapsed && "mt-2")}
        >
          {isCollapsed ? <Menu size={16} /> : <ChevronLeft size={16} />}
        </Button>
      </div>

      <nav className={cn("grid gap-1 text-sm font-semibold text-[var(--muted)]", isCollapsed ? "px-2" : "")}>
        {ownerNav.map(({ href, label, Icon }) => {
          const isActive = href === "/owner" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link 
              key={href} 
              className={cn(
                "flex items-center gap-3 rounded-lg transition-all",
                isCollapsed ? "justify-center h-12 w-12" : "px-3 py-3 hover:bg-white",
                isActive ? "bg-white text-[var(--primary)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--primary)]"
              )} 
              href={href}
              title={isCollapsed ? label : undefined}
            >
              <Icon size={isCollapsed ? 20 : 18} aria-hidden="true" className={cn(isActive ? "text-[var(--primary)]" : "text-[var(--subtle)]")} />
              {!isCollapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Decorative indicator for collapsed state */}
      {isCollapsed && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 opacity-20">
          <ShieldCheck size={24} />
        </div>
      )}
    </aside>
  );
}
