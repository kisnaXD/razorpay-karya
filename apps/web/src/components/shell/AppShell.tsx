import type { ReactNode } from "react";

type AppShellProps = {
  nav: ReactNode;
  canvas: ReactNode;
  agent: ReactNode;
  status: ReactNode;
};

export function AppShell({ nav, canvas, agent, status }: AppShellProps) {
  return (
    <div
      className="grid h-screen bg-ink text-text"
      style={{
        gridTemplateColumns: "56px 1fr 360px",
        gridTemplateRows: "1fr 32px",
      }}
    >
      <aside className="row-span-2 border-r border-line bg-surface">{nav}</aside>
      <main className="min-h-0 overflow-hidden border-r border-line bg-ink">
        {canvas}
      </main>
      <aside className="min-h-0 overflow-hidden bg-surface">{agent}</aside>
      <footer className="col-span-2 border-t border-line bg-surface">{status}</footer>
    </div>
  );
}
