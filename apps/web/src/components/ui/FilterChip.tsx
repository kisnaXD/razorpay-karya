"use client";

import type { ReactNode } from "react";

export type FilterChipProps = {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
};

export function FilterChip({ active, onClick, children }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "rounded-full border px-2.5 py-1 text-xs",
        "transition-colors duration-[var(--duration-fast)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
        active
          ? "border-signal/30 bg-signal/10 text-signal"
          : "border-line bg-surface-2 text-muted hover:text-text",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
