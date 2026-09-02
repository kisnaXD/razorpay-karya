"use client";

import { useState } from "react";
import type { SideEffectClass, ToolTraceStatus } from "@/lib/api";

export type ToolTraceRowProps = {
  toolName: string;
  sideEffectClass: SideEffectClass;
  status: ToolTraceStatus;
  explanation: string;
  outputSummary?: string;
};

const TOOL_META: Record<string, { icon: string; label: string }> = {
  inventory_promise_query: { icon: "📊", label: "Queried inventory" },
  inventory_get_stock: { icon: "📊", label: "Queried inventory" },
  sales_get_order_book: { icon: "📋", label: "Checked orders" },
  sales_get_order: { icon: "📋", label: "Fetched order" },
  sourcing_search_vendors: { icon: "🔧", label: "Searched vendors" },
  sourcing_get_quotes: { icon: "💬", label: "Fetched quotes" },
  po_create_draft: { icon: "📝", label: "Drafted purchase order" },
  po_list: { icon: "📝", label: "Listed POs" },
  ledger_query: { icon: "💰", label: "Queried ledger" },
  payment_link_create: { icon: "🔗", label: "Created payment link" },
  payment_link_list: { icon: "🔗", label: "Listed payment links" },
  people_search: { icon: "👤", label: "Searched people" },
  calendar_query: { icon: "📅", label: "Checked calendar" },
  comms_draft_email: { icon: "✉️", label: "Drafted email" },
  policy_evaluate: { icon: "🛡️", label: "Evaluated policy" },
  work_order_query: { icon: "⚙️", label: "Checked work orders" },
  bom_query: { icon: "🧩", label: "Queried BOM" },
  generate_report: { icon: "📑", label: "Generated report" },
  root_cause_analysis: { icon: "🔎", label: "Root-cause analysis" },
};

function friendlyMeta(toolName: string): { icon: string; label: string } {
  const known = TOOL_META[toolName];
  if (known) return known;
  const label = toolName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return { icon: "⚡", label };
}

function statusTone(status: ToolTraceStatus): string {
  switch (status) {
    case "running":
      return "border-l-copper text-text";
    case "awaiting_approval":
      return "border-l-warn text-text";
    case "error":
      return "border-l-risk text-risk";
    default:
      return "border-l-line text-muted";
  }
}

export function ToolTraceRow({
  toolName,
  sideEffectClass,
  status,
  explanation,
  outputSummary,
}: ToolTraceRowProps) {
  const [open, setOpen] = useState(false);
  const meta = friendlyMeta(toolName);
  const hasDetails = Boolean(explanation || outputSummary);

  return (
    <div
      className={[
        "max-w-[90%] overflow-hidden rounded-xl border border-line/40 bg-surface-2/40 text-[11px]",
        "border-l-[3px]",
        statusTone(status),
      ].join(" ")}
      data-status={status}
      data-side-effect={sideEffectClass}
    >
      <button
        type="button"
        onClick={() => hasDetails && setOpen((v) => !v)}
        className={[
          "flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left",
          hasDetails ? "cursor-pointer hover:bg-surface-2/60" : "cursor-default",
        ].join(" ")}
        aria-expanded={hasDetails ? open : undefined}
      >
        <span aria-hidden>{meta.icon}</span>
        <span className="truncate font-medium tracking-tight">{meta.label}</span>
        {status === "running" ? (
          <span className="ml-auto shrink-0 animate-pulse text-[10px] text-copper">
            …
          </span>
        ) : null}
      </button>
      {open && hasDetails ? (
        <div className="space-y-0.5 border-t border-line/30 px-2.5 py-1.5 text-[10px] text-muted">
          <div className="font-mono tracking-tight opacity-70">{toolName}</div>
          {explanation ? <div className="leading-[1.4]">{explanation}</div> : null}
          {outputSummary ? (
            <div className="truncate font-mono opacity-70">{outputSummary}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
