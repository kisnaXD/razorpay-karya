type AgentRailProps = {
  exceptionCount: number;
};

export function AgentRail({ exceptionCount }: AgentRailProps) {
  const needLabel =
    exceptionCount === 1
      ? "One exception needs you."
      : `${exceptionCount} exceptions need you.`;

  return (
    <div className="flex h-full flex-col border-l-[2px] border-l-copper">
      <header className="shrink-0 border-b border-line px-4 py-3">
        <h2 className="text-[12px] font-medium uppercase tracking-[0.12em] text-text">
          Governor
        </h2>
      </header>
      <div className="flex-1 px-4 py-4">
        <p className="max-w-[280px] leading-[1.5] text-muted">
          Governor idle. {needLabel}
        </p>
      </div>
      <footer className="shrink-0 border-t border-line px-4 py-3 text-[12px] leading-[1.45] text-muted">
        Approval cards appear here when money moves.
      </footer>
    </div>
  );
}
