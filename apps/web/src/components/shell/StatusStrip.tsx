import { formatCash } from "@/lib/format";

type StatusStripProps = {
  cashInPaise: number;
  exceptionCount: number;
};

export function StatusStrip({ cashInPaise, exceptionCount }: StatusStripProps) {
  const exLabel = exceptionCount === 1 ? "exception" : "exceptions";

  return (
    <div className="flex h-8 items-center gap-6 px-4 font-mono text-[12px] tabular-nums">
      <span className="text-text">{formatCash(cashInPaise)}</span>
      <span className="text-muted">
        <span className="text-text">{exceptionCount}</span> {exLabel}
      </span>
      <span className="ml-auto text-muted">graph</span>
    </div>
  );
}
