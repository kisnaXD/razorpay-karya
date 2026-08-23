type AgentRailProps = {
  exceptionCount: number;
};

export function AgentRail({ exceptionCount }: AgentRailProps) {
  const needLabel =
    exceptionCount === 1
      ? "One exception needs you."
      : `${exceptionCount} exceptions need you.`;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line border-l-[2px] border-l-copper px-4 py-3">
        <h2 className="text-[12px] font-medium uppercase tracking-[0.12em] text-text">
          Governor
        </h2>
      </header>
      <div className="flex flex-1 flex-col justify-between px-4 py-4">
        <p className="max-w-[280px] leading-[1.5] text-muted">
          Governor idle. {needLabel}
        </p>
        <p className="border-t border-line pt-3 text-[12px] leading-[1.45] text-muted">
          Approval cards appear here when money moves.
        </p>
      </div>
    </div>
  );
}
