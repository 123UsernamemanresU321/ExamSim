"use client";

import { useState } from "react";
import { SidebarNav } from "./sidebar-nav";

export function OwnerShell({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div 
      className="app-shell-grid h-[calc(100vh-64px)] transition-all duration-300 overflow-hidden"
      style={{ "--sidebar-width": isCollapsed ? "64px" : "256px" } as React.CSSProperties}
    >
      <SidebarNav isCollapsed={isCollapsed} onToggle={() => setIsCollapsed(!isCollapsed)} />
      <main className="min-w-0 flex flex-col h-full px-5 py-8 md:px-8 overflow-y-auto">{children}</main>
    </div>
  );
}
