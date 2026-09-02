"use client";

import { formatInrExact } from "@/lib/format";
import type { PolicyDecision } from "@/lib/api";

export type ApprovalCardProps = {
  id: string;
  title: string;
  amountInPaise: number | null;
  why: string;
  policyLabel: string | null;
  policyDecision: PolicyDecision;
  onApprove: () => void;
  onEdit: () => void;
  onReject: () => void;
  loading?: boolean;
};

function decisionLabel(decision: PolicyDecision): string {
  if (decision === "require_approval") return "require approval";
  return decision;
}

export function ApprovalCard({
  title,
  amountInPaise,
  why,
  policyLabel,
  policyDecision,
  onApprove,
  onEdit,
  onReject,
  loading = false,
}: ApprovalCardProps) {
  const policyLine = policyLabel
    ? `Policy: ${policyLabel} · ${decisionLabel(policyDecision)}`
    : `Policy: none matched · ${decisionLabel(policyDecision)}`;

  return (
    <article className="animate-fade-in-up rounded-2xl border border-line/50 border-l-[3px] border-l-copper bg-surface-2/60 p-3.5 shadow-sm">
      <h3 className="text-[13px] font-medium text-text">{title}</h3>
      {amountInPaise != null ? (
        <p className="mt-1 font-mono text-[13px] text-teal tabular-nums">
          {formatInrExact(amountInPaise)}
        </p>
      ) : null}
      <p className="mt-1.5 text-[12px] leading-[1.45] text-muted">{why}</p>
      <p className="mt-1.5 font-mono text-[11px] text-muted/80">{policyLine}</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={loading}
          onClick={onApprove}
          className="rounded-lg border border-teal/60 bg-teal/10 px-2.5 py-1 text-[12px] text-teal transition-colors hover:bg-teal/20 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={onEdit}
          className="rounded-lg px-2.5 py-1 text-[12px] text-muted transition-colors hover:bg-surface hover:text-text disabled:opacity-50"
        >
          Edit
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={onReject}
          className="rounded-lg px-2.5 py-1 text-[12px] text-risk transition-colors hover:bg-risk/10 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </article>
  );
}
