import type { ConsoleView } from "@/lib/api";
import { formatCash } from "@/lib/format";

type StatusStripProps = {
  cashInPaise: number;
  exceptionCount: number;
  onNavigate: (view: ConsoleView) => void;
};

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";

export function StatusStrip({
  cashInPaise,
  exceptionCount,
  onNavigate,
}: StatusStripProps) {
  const exLabel = exceptionCount === 1 ? "exception" : "exceptions";

  return (
    <div className="flex h-8 items-center gap-3 px-4 font-mono text-[12px] tabular-nums">
      <button
        type="button"
        onClick={() => onNavigate("ledger")}
        className={`rounded-sm bg-transparent ${FOCUS}`}
        aria-label="Open ledger"
      >
        <span className="text-text">{formatCash(cashInPaise)}</span>{" "}
        <span className="text-muted">cash</span>
      </button>
      <span className="text-muted" aria-hidden>
        ·
      </span>
      <button
        type="button"
        onClick={() => onNavigate("inbox")}
        className={`rounded-sm bg-transparent ${FOCUS}`}
        aria-label="Open inbox"
      >
        <span className="text-text">{exceptionCount}</span>{" "}
        <span className="text-muted">{exLabel}</span>
      </button>
      <span className="ml-auto font-display text-[13px] italic text-text">
        Karya
      </span>
    </div>
  );
}
