"use client";

import { useState } from "react";
import { SidebarNav } from "./sidebar-nav";
import { cn } from "@/lib/utils";

export function OwnerShell({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div 
      className="app-shell-grid transition-all duration-300"
      style={{ "--sidebar-width": isCollapsed ? "64px" : "256px" } as any}
    >
      <SidebarNav isCollapsed={isCollapsed} onToggle={() => setIsCollapsed(!isCollapsed)} />
      <main className="min-w-0 overflow-hidden">{children}</main>
    </div>
  );
}
