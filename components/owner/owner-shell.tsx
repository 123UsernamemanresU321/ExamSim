"use client";

import { useState } from "react";
import { OwnerMobileNav, SidebarNav } from "./sidebar-nav";

export function OwnerShell({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div 
      className="app-shell-grid min-h-[calc(100vh-64px)]"
      style={{ "--sidebar-width": isCollapsed ? "64px" : "256px" } as React.CSSProperties}
    >
      <div className="border-b border-[var(--border)] bg-[var(--surface-muted)] p-3 md:hidden">
        <OwnerMobileNav />
      </div>
      <SidebarNav isCollapsed={isCollapsed} onToggle={() => setIsCollapsed(!isCollapsed)} />
      <main className="min-w-0 px-4 py-6 sm:px-5 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
