"use client";

import { SidebarNav } from "./sidebar-nav";

export function OwnerShell({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div 
      className="app-shell-grid transition-all duration-300"
      style={{ "--sidebar-width": isCollapsed ? "64px" : "256px" } as React.CSSProperties}
    >
      <SidebarNav isCollapsed={isCollapsed} onToggle={() => setIsCollapsed(!isCollapsed)} />
      <main className="min-w-0 px-5 py-8 md:px-8 overflow-hidden">{children}</main>
    </div>
  );
}
