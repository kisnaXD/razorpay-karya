"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchPendingApprovals,
  resolveApproval,
  type ApprovalDto,
} from "@/lib/api";
import { useConsole } from "@/lib/console-context";
import { useAgent } from "@/lib/agent-context";
import { ApprovalCard } from "./ApprovalCard";
import { FailureImpactBlock } from "./FailureImpactBlock";

function approvalTitle(approval: ApprovalDto): string {
  const { action, targetNodeKey, metadata } = approval.proposedAction;
  const target = targetNodeKey?.split(":")[1] ?? targetNodeKey ?? "action";
  if (action === "po.create") {
    const qty = metadata?.qtyKg;
    const material =
      typeof metadata?.materialLabel === "string"
        ? metadata.materialLabel
        : typeof metadata?.materialKey === "string"
          ? metadata.materialKey.split(":")[1] ?? metadata.materialKey
          : "material";
    const vendor =
      typeof metadata?.vendorLabel === "string"
        ? metadata.vendorLabel
        : target;
    const qtyPart = typeof qty === "number" ? `${qty}kg ` : "";
    return `Draft PO — ${qtyPart}${material} to ${vendor}`;
  }
  if (action === "money.recovery") {
    const opt = metadata?.option;
    if (opt === "retry_link") return "Retry Payment Link for INV-90";
    if (opt === "hold_stock_48h") return "Hold stock 48h for SO-218";
    if (opt === "release_to_lead") return "Release stock to IG-Ananya";
  }
  if (action === "collect.invoice") {
    return `Send Payment Link for ${target}`;
  }
  if (action === "pay.vendor") {
    return `Pay vendor ${target}`;
  }
  return `${action} · ${target}`;
}

function approvalWhy(approval: ApprovalDto): string {
  if (approval.proposedAction.action === "po.create") {
    const metaWhy = approval.proposedAction.metadata?.why;
    if (typeof metaWhy === "string" && metaWhy.length > 0) return metaWhy;
  }
  return approval.why;
}

function policyLabelFrom(approval: ApprovalDto): string | null {
  const matched = approval.evaluation.results.find((r) => r.policyLabel);
  return matched?.policyLabel ?? null;
}

export function ApprovalCardList() {
  const { focusNode } = useConsole();
  const { resumeFromApproval, refresh } = useAgent();
  const [approvals, setApprovals] = useState<ApprovalDto[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const pending = await fetchPendingApprovals();
      setApprovals(pending);
    } catch {
      setApprovals([]);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const impactSummary = useMemo(() => {
    const recovery = approvals.find(
      (a) => a.proposedAction.action === "money.recovery",
    );
    if (!recovery) return null;
    const meta = recovery.proposedAction.metadata?.impactSummary;
    if (typeof meta === "string" && meta.length > 0) return meta;
    return recovery.why;
  }, [approvals]);

  const handleResolve = async (
    id: string,
    status: "approved" | "rejected",
  ) => {
    setLoadingId(id);
    try {
      await resolveApproval(id, status);
      await resumeFromApproval(id);
      await refresh();
      await load();
    } finally {
      setLoadingId(null);
    }
  };

  if (approvals.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {impactSummary ? <FailureImpactBlock summary={impactSummary} /> : null}
      {approvals.map((approval) => (
        <ApprovalCard
          key={approval._id}
          id={approval._id}
          title={approvalTitle(approval)}
          amountInPaise={approval.proposedAction.amountInPaise ?? null}
          why={approvalWhy(approval)}
          policyLabel={policyLabelFrom(approval)}
          policyDecision={approval.evaluation.finalDecision}
          loading={loadingId === approval._id}
          onApprove={() => void handleResolve(approval._id, "approved")}
          onReject={() => void handleResolve(approval._id, "rejected")}
          onEdit={() => {
            const key =
              approval.proposedAction.action === "money.recovery"
                ? "SalesOrder:SO-218"
                : approval.proposedAction.targetNodeKey;
            if (key) focusNode(key);
          }}
        />
      ))}
    </div>
  );
}

export function usePendingApprovalCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const pending = await fetchPendingApprovals();
        setCount(pending.length);
      } catch {
        setCount(0);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  return count;
}
