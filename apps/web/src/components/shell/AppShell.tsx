import type { ReactNode } from "react";

type AppShellProps = {
  sidebar: ReactNode;
  topbar: ReactNode;
  content: ReactNode;
  dock: ReactNode;
  sidebarExpanded?: boolean;
};

export function AppShell({
  sidebar,
  topbar,
  content,
  dock,
  sidebarExpanded = true,
}: AppShellProps) {
  const sidebarWidth = sidebarExpanded ? "240px" : "56px";

  return (
    <div
      className="grid h-screen bg-ink text-text transition-[grid-template-columns] duration-200"
      style={{
        gridTemplateColumns: `${sidebarWidth} 1fr`,
        gridTemplateRows: "48px 1fr",
      }}
    >
      <div className="col-span-2 min-h-0">{topbar}</div>
      <aside className="min-h-0 overflow-hidden border-r border-line bg-surface">
        {sidebar}
      </aside>
      <main className="relative min-h-0 overflow-auto bg-ink">{content}</main>
      {dock}
    </div>
  );
}
