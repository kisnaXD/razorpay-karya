"use client";

import { useEffect, useRef, useState } from "react";
import {
  FALLBACK_AGENT_PERSONAS,
  type AgentId,
  type ConsultStatus,
} from "@/lib/api";

export type ConsultTraceRowProps = {
  agentId: AgentId;
  question: string;
  findings: string | null;
  status: ConsultStatus;
  error?: string | null;
  children?: React.ReactNode;
};

function statusLabel(status: ConsultStatus): string {
  switch (status) {
    case "running":
      return "Consulting…";
    case "done":
      return "done";
    case "error":
      return "error";
  }
}

function borderTone(status: ConsultStatus): string {
  switch (status) {
    case "running":
      return "border-l-warn";
    case "done":
      return "border-l-teal";
    case "error":
      return "border-l-risk";
  }
}

export function ConsultTraceRow({
  agentId,
  question,
  findings,
  status,
  error,
  children,
}: ConsultTraceRowProps) {
  const [expanded, setExpanded] = useState(status === "running");
  const persona =
    FALLBACK_AGENT_PERSONAS.find((p) => p.id === agentId) ?? null;
  const label = persona?.displayName ?? "Specialist";
  const icon = persona?.icon ?? "🤝";
  const hasFindings = Boolean(findings);
  const showFindings = status === "running" || expanded;

  return (
    <div
      className={[
        "max-w-[95%] rounded-lg border border-line/40 bg-surface-2/50 p-3",
        "border-l-2 transition-all duration-200",
        borderTone(status),
      ].join(" ")}
      data-status={status}
      data-agent={agentId}
    >
      <div className="flex items-center gap-2 text-[11px]">
        {status === "running" ? (
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-warn"
            aria-hidden
          />
        ) : null}
        <span aria-hidden>{icon}</span>
        <span className="min-w-0 flex-1 truncate font-medium tracking-tight text-text">
          {status === "running"
            ? `Consulting ${label}...`
            : `Consulted ${label}`}
        </span>
        <span
          className={[
            "shrink-0 rounded px-1.5 py-0.5 text-[10px]",
            status === "running"
              ? "animate-pulse text-warn"
              : status === "done"
                ? "text-teal"
                : "text-risk",
          ].join(" ")}
        >
          {statusLabel(status)}
        </span>
      </div>

      {question ? (
        <p className="mt-2 text-[11px] italic leading-[1.4] text-muted">
          &ldquo;{question}&rdquo;
        </p>
      ) : null}

      {status === "error" && error ? (
        <p className="mt-2 text-[11px] leading-[1.4] text-risk">{error}</p>
      ) : null}

      {hasFindings && status === "running" ? (
        <p className="mt-2 text-[11px] leading-[1.45] text-text">
          <span className="text-muted">Finding: </span>
          {findings}
        </p>
      ) : null}

      {hasFindings && status === "done" ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 flex w-full items-start gap-1.5 text-left text-[11px] leading-[1.45] text-text transition-colors duration-200 hover:text-signal"
          aria-expanded={expanded}
        >
          <span className="mt-0.5 shrink-0 text-[10px] text-muted" aria-hidden>
            {expanded ? "▼" : "▶"}
          </span>
          <span>
            <span className="text-muted">Finding: </span>
            {showFindings
              ? findings
              : `${findings!.slice(0, 48)}${findings!.length > 48 ? "…" : ""}`}
          </span>
        </button>
      ) : null}

      {children ? (
        <div className="mt-2 flex flex-col gap-1.5 border-t border-line/30 pt-2 pl-1">
          {children}
        </div>
      ) : null}
    </div>
  );
}
