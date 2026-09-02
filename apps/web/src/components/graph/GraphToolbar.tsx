"use client";

import { useReactFlow } from "@xyflow/react";
import type { ReactNode } from "react";

type GraphToolbarProps = {
  searchOpen: boolean;
  onSearchToggle: () => void;
};

function ToolbarButton({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active || undefined}
      title={label}
      onClick={onClick}
      className={[
        "flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-muted",
        "hover:bg-surface-2 hover:text-text",
        active ? "bg-surface-2 text-text" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function GraphToolbar({ searchOpen, onSearchToggle }: GraphToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div
      className="absolute right-3 top-3 z-10 flex gap-1 rounded-[var(--radius-md)] border border-line bg-surface p-1"
      role="toolbar"
      aria-label="Graph controls"
    >
      <ToolbarButton label="Zoom in" onClick={() => void zoomIn({ duration: 150 })}>
        <span className="text-[16px] leading-none">+</span>
      </ToolbarButton>
      <ToolbarButton label="Zoom out" onClick={() => void zoomOut({ duration: 150 })}>
        <span className="text-[16px] leading-none">−</span>
      </ToolbarButton>
      <ToolbarButton
        label="Fit view"
        onClick={() => void fitView({ padding: 0.2, duration: 200 })}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        label="Search nodes"
        onClick={onSearchToggle}
        active={searchOpen}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5 14 14" />
        </svg>
      </ToolbarButton>
    </div>
  );
}
