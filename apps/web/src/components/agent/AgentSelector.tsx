"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { AgentId, AgentPersonaDto } from "@/lib/api";

export type AgentSelectorProps = {
  personas: AgentPersonaDto[];
  selected: AgentId;
  onSelect: (id: AgentId) => void;
  disabled?: boolean;
};

export function AgentSelector({
  personas,
  selected,
  onSelect,
  disabled,
}: AgentSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current =
    personas.find((p) => p.id === selected) ??
    personas[0] ??
    null;

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!current) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={[
          "flex items-center gap-1 rounded-lg border border-line bg-surface-2 px-2 py-0.5",
          "text-[11px] text-text transition-all duration-200",
          "hover:border-signal/40 disabled:opacity-50",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
        ].join(" ")}
      >
        <span aria-hidden>{current.icon}</span>
        <span className="font-medium tracking-tight">{current.shortName}</span>
        <span className="text-muted" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Select agent"
          className={[
            "absolute left-0 top-full z-20 mt-1 w-64 overflow-hidden",
            "rounded-lg border border-line bg-surface-2 shadow-lg",
            "animate-fade-in-up",
          ].join(" ")}
        >
          {personas.map((persona) => {
            const isSelected = persona.id === selected;
            return (
              <li key={persona.id} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(persona.id);
                    setOpen(false);
                  }}
                  className={[
                    "flex w-full items-start gap-2 px-2.5 py-2 text-left transition-colors duration-150",
                    "hover:bg-surface/80",
                    isSelected ? "bg-signal/20" : "",
                  ].join(" ")}
                >
                  <span className="mt-0.5 shrink-0 text-sm" aria-hidden>
                    {persona.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-medium text-text">
                      {persona.displayName}
                    </span>
                    <span className="block text-[10px] leading-[1.35] text-muted">
                      {persona.description}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
