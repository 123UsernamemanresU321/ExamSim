"use client";

import { useState } from "react";
import { Bell, HelpCircle, Menu } from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { IconButton } from "@/components/ui/icon-button";
import { OwnerCommandPalette } from "@/components/owner/owner-command-palette";
import { OwnerMobileNav, SidebarNav } from "./sidebar-nav";

export function OwnerShell({ children, displayName = "Admin User" }: { children: React.ReactNode; displayName?: string }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div 
      className="app-shell-grid"
      style={{ "--sidebar-width": isCollapsed ? "64px" : "260px" } as React.CSSProperties}
    >
      <SidebarNav isCollapsed={isCollapsed} onToggle={() => setIsCollapsed(!isCollapsed)} displayName={displayName} />
      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-[var(--border)] bg-white px-4 md:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="md:hidden">
              <OwnerMobileNav />
            </div>
            <IconButton className="hidden md:inline-flex" onClick={() => setIsCollapsed(!isCollapsed)} aria-label="Toggle owner navigation">
              <Menu size={16} aria-hidden="true" />
            </IconButton>
            <OwnerCommandPalette />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <IconButton aria-label="Notifications"><Bell size={16} aria-hidden="true" /></IconButton>
            <IconButton aria-label="Help"><HelpCircle size={16} aria-hidden="true" /></IconButton>
            <div className="hidden h-6 w-px bg-[var(--border)] sm:block" />
            <div className="hidden items-center gap-2 sm:flex">
              <span className="grid size-8 place-items-center rounded-full bg-[#bec6e0] text-xs font-semibold text-[var(--sidebar)]">
                {initials(displayName)}
              </span>
              <span className="text-xs font-semibold text-[var(--ink)]">{displayName}</span>
            </div>
            <SignOutButton />
          </div>
        </header>
        <main className="app-page-canvas">{children}</main>
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
    .join("") || "AD";
}
