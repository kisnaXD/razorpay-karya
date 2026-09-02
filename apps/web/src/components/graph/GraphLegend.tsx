"use client";

import { useState } from "react";
import { NODE_SHAPE_ENTRIES, placeholderNodeData } from "./node-shapes";

export function GraphLegend() {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute bottom-3 left-3 z-10 max-w-[280px]">
      <div className="rounded-[var(--radius-md)] border border-line bg-surface/90 p-3 backdrop-blur-sm">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between text-[12px] text-muted hover:text-text"
        >
          Legend
          <span aria-hidden className="ml-3 text-[10px]">
            {open ? "−" : "+"}
          </span>
        </button>
        {open ? (
          <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {NODE_SHAPE_ENTRIES.map(({ type, Shape }) => (
              <li key={type} className="flex items-center gap-1.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden">
                  <span className="origin-center scale-[0.55]">
                    <Shape data={placeholderNodeData(type)} />
                  </span>
                </span>
                <span className="truncate text-[11px] text-muted">{type}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
