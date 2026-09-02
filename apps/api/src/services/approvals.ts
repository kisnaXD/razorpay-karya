import type { Db } from "mongodb";
import { ulid } from "ulid";
import type { GraphStore, NodeRecord } from "@karya/graph";
import { newNodeId } from "@karya/graph";
import type { EvaluateOutcome, ProposedAction } from "@karya/policy";
import type { RazorpayClient } from "@karya/razorpay";
import type { PayoutAdapter } from "@karya/razorpay";
import { writeAuditEvent } from "./audit.js";
import { recordMemory, recordOverride } from "./agent-memory.js";
import { evaluateAction } from "./policy.js";
import { createPaymentLinkForInvoice } from "./payment-links.js";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "edited";

export type ApprovalRecord = {
  _id: string;
  orgId: string;
  status: ApprovalStatus;
  proposedAction: ProposedAction;
  evaluation: EvaluateOutcome;
  why: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
};

export type CreateApprovalResult =
  | { approval: ApprovalRecord }
  | { autoAllowed: true; evaluation: EvaluateOutcome };

export type ApprovalExecutionDeps = {
  razorpayClient: RazorpayClient | null;
  payoutAdapter: PayoutAdapter;
  resendApiKey?: string;
  resendFrom?: string;
};

function newApprovalId(): string {
  return `appr_${ulid()}`;
}

function collection(db: Db) {
  return db.collection<ApprovalRecord>("approvals");
}

function propNumber(props: NodeRecord["props"], key: string): number {
  const value = props[key];
  return typeof value === "number" ? value : 0;
}

export async function createApproval(
  db: Db,
  store: GraphStore,
  orgId: string,
  proposed: ProposedAction,
): Promise<CreateApprovalResult> {
  const evaluation = await evaluateAction(store, orgId, proposed);

  if (evaluation.finalDecision === "allow") {
    return { autoAllowed: true, evaluation };
  }

  if (evaluation.finalDecision === "deny") {
    throw new ApprovalDeniedError(evaluation);
  }

  const now = new Date();
  const record: ApprovalRecord = {
    _id: newApprovalId(),
    orgId,
    status: "pending",
    proposedAction: proposed,
    evaluation,
    why: proposed.explanation,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
  };

  await collection(db).insertOne(record);

  await writeAuditEvent(store, {
    orgId,
    eventType: "approval.created",
    actor: proposed.proposedBy,
    sideEffectClass: "draft",
    payload: {
      approvalId: record._id,
      proposed,
      evaluation,
    },
  });

  return { approval: record };
}

export async function listApprovals(
  db: Db,
  orgId: string,
  filter?: { status?: ApprovalStatus },
): Promise<ApprovalRecord[]> {
  const query: { orgId: string; status?: ApprovalStatus } = { orgId };
  if (filter?.status) query.status = filter.status;
  return collection(db)
    .find(query)
    .sort({ createdAt: -1 })
    .toArray();
}

/** PO keys already claimed by pending po.create approvals. */
export async function listReservedPoKeys(
  db: Db,
  orgId: string,
): Promise<string[]> {
  const pending = await collection(db)
    .find({
      orgId,
      status: "pending",
      "proposedAction.action": "po.create",
    })
    .toArray();
  const keys: string[] = [];
  for (const a of pending) {
    const poKey = a.proposedAction.metadata?.poKey;
    if (typeof poKey === "string" && poKey.length > 0) keys.push(poKey);
  }
  return keys;
}

export async function getApproval(
  db: Db,
  orgId: string,
  approvalId: string,
): Promise<ApprovalRecord | null> {
  return collection(db).findOne({ _id: approvalId, orgId });
}

async function incrementInvoiceNudge(
  store: GraphStore,
  orgId: string,
  invoiceKey: string,
): Promise<void> {
  const invoice = await store.getNodeByKey(orgId, invoiceKey);
  if (!invoice || invoice.type !== "Invoice") return;
  await store.upsertNode({
    _id: invoice._id,
    orgId: invoice.orgId,
    type: invoice.type,
    key: invoice.key,
    label: invoice.label,
    props: {
      ...invoice.props,
      nudge_count: propNumber(invoice.props, "nudge_count") + 1,
      last_nudge_at: new Date().toISOString(),
      collections_state: "link_sent",
    },
  });
}

async function executeApprovedAction(
  store: GraphStore,
  orgId: string,
  proposed: ProposedAction,
  resolvedBy: string,
  deps?: ApprovalExecutionDeps,
): Promise<void> {
  const action = proposed.action;
  const meta = proposed.metadata ?? {};

  if (action === "collect.invoice" && proposed.targetNodeKey) {
    if (!deps?.razorpayClient) {
      throw new Error("razorpay_not_configured");
    }
    await createPaymentLinkForInvoice(
      store,
      deps.razorpayClient,
      writeAuditEvent,
      {
        orgId,
        invoiceKey: proposed.targetNodeKey,
        actor: resolvedBy,
      },
    );
    await incrementInvoiceNudge(store, orgId, proposed.targetNodeKey);
    return;
  }

  if (action === "pay.vendor" && proposed.targetNodeKey && deps) {
    const amount = proposed.amountInPaise ?? 0;
    const result = await deps.payoutAdapter.proposePayout({
      orgId,
      vendorOrgKey: proposed.targetNodeKey,
      amountInPaise: amount,
      purpose: "vendor payout",
      idempotencyKey: `karya_${orgId}_payout_${proposed.targetNodeKey}_${Date.now()}`,
      explanation: proposed.explanation,
    });
    const vendor = await store.getNodeByKey(orgId, proposed.targetNodeKey);
    await store.upsertNode({
      _id: newNodeId(),
      orgId,
      type: "Payment",
      key: `Payment:${result.payoutId}`,
      label: result.payoutId,
      props: {
        status: result.status,
        channel: "payout",
        amountInPaise: amount,
        razorpay_payout_id: result.razorpayPayoutId ?? result.payoutId,
        vendor_key: proposed.targetNodeKey,
        vendor_label: vendor?.label ?? null,
        counterparty: vendor?.label ?? null,
      },
    });
    await writeAuditEvent(store, {
      orgId,
      eventType: "payout.proposed",
      actor: resolvedBy,
      sideEffectClass: "money",
      payload: {
        payoutId: result.payoutId,
        vendorKey: proposed.targetNodeKey,
        amountInPaise: amount,
      },
    });
    return;
  }

  if (action === "money.recovery") {
    const option = meta.option;
    if (option === "retry_link") {
      const invoiceKey = String(meta.invoiceKey ?? proposed.targetNodeKey ?? "");
      if (!invoiceKey) throw new Error("recovery retry missing invoiceKey");
      if (!deps?.razorpayClient) throw new Error("razorpay_not_configured");
      const idem =
        `karya_${orgId}_payment_link_${invoiceKey}_retry_${Date.now()}`;
      await createPaymentLinkForInvoice(
        store,
        deps.razorpayClient,
        writeAuditEvent,
        {
          orgId,
          invoiceKey,
          idempotencyKey: idem,
          actor: resolvedBy,
        },
      );
      await incrementInvoiceNudge(store, orgId, invoiceKey);
      await writeAuditEvent(store, {
        orgId,
        eventType: "money.recovery.retry_link",
        actor: resolvedBy,
        sideEffectClass: "money",
        payload: { invoiceKey, option },
      });
      return;
    }

    if (option === "hold_stock_48h") {
      const stockKey = String(meta.stockKey ?? "");
      const stock = stockKey
        ? await store.getNodeByKey(orgId, stockKey)
        : null;
      if (!stock) throw new Error(`Stock not found: ${stockKey}`);
      const holdUntil = new Date(
        Date.now() + 48 * 60 * 60 * 1000,
      ).toISOString();
      await store.upsertNode({
        _id: stock._id,
        orgId: stock.orgId,
        type: stock.type,
        key: stock.key,
        label: stock.label,
        props: { ...stock.props, hold_until: holdUntil },
      });
      await writeAuditEvent(store, {
        orgId,
        eventType: "money.recovery.hold_stock",
        actor: resolvedBy,
        sideEffectClass: "money",
        payload: { stockKey, holdUntil },
        aboutNodeIds: [stock._id],
      });
      return;
    }

    if (option === "release_to_lead") {
      const stockKey = String(meta.stockKey ?? "");
      const leadKey = String(meta.leadKey ?? "");
      const stock = stockKey
        ? await store.getNodeByKey(orgId, stockKey)
        : null;
      if (!stock) throw new Error(`Stock not found: ${stockKey}`);
      const reserved = Math.max(0, propNumber(stock.props, "reserved") - 1);
      await store.upsertNode({
        _id: stock._id,
        orgId: stock.orgId,
        type: stock.type,
        key: stock.key,
        label: stock.label,
        props: { ...stock.props, reserved },
      });
      const leadLabel = leadKey.split(":")[1] ?? leadKey;
      await store.upsertNode({
        _id: newNodeId(),
        orgId,
        type: "Task",
        key: `Task:Release-to-${leadLabel}`,
        label: `Release to ${leadLabel}`,
        props: {
          status: "open",
          stockKey,
          leadKey,
        },
      });
      await writeAuditEvent(store, {
        orgId,
        eventType: "money.recovery.release_to_lead",
        actor: resolvedBy,
        sideEffectClass: "money",
        payload: { stockKey, leadKey, reserved },
        aboutNodeIds: [stock._id],
      });
    }
  }

  if (action === "po.create") {
    const { commitPurchaseOrderFromProposed } = await import(
      "./purchase-orders.js"
    );
    await commitPurchaseOrderFromProposed(
      store,
      orgId,
      proposed,
      resolvedBy,
    );
  }

  if (action === "listing.publish" && proposed.targetNodeKey) {
    const { executePublishListing } = await import("./listings.js");
    await executePublishListing(
      store,
      orgId,
      proposed.targetNodeKey,
      resolvedBy,
    );
    return;
  }

  if (action === "email.send" && proposed.targetNodeKey) {
    const { executeSendEmail } = await import("./comms.js");
    await executeSendEmail(
      store,
      orgId,
      proposed.targetNodeKey,
      resolvedBy,
      {
        ...(deps?.resendApiKey !== undefined
          ? { apiKey: deps.resendApiKey }
          : {}),
        ...(deps?.resendFrom !== undefined ? { from: deps.resendFrom } : {}),
      },
    );
  }
}

export async function resolveApproval(
  db: Db,
  store: GraphStore,
  orgId: string,
  approvalId: string,
  resolution: {
    status: "approved" | "rejected" | "edited";
    resolvedBy: string;
    note?: string;
  },
  deps?: ApprovalExecutionDeps,
): Promise<ApprovalRecord> {
  const existing = await getApproval(db, orgId, approvalId);
  if (!existing) {
    throw new ApprovalNotFoundError(approvalId);
  }
  if (existing.status !== "pending") {
    throw new ApprovalAlreadyResolvedError(approvalId);
  }

  const now = new Date();
  const updated: ApprovalRecord = {
    ...existing,
    status: resolution.status,
    resolvedBy: resolution.resolvedBy,
    resolutionNote: resolution.note ?? null,
    resolvedAt: now,
    updatedAt: now,
  };

  await collection(db).replaceOne({ _id: approvalId, orgId }, updated);

  await writeAuditEvent(store, {
    orgId,
    eventType: "approval.resolved",
    actor: resolution.resolvedBy,
    sideEffectClass: "write",
    payload: {
      approvalId,
      status: resolution.status,
      proposed: existing.proposedAction,
      note: resolution.note ?? null,
    },
  });

  if (resolution.status === "rejected" && resolution.note) {
    await recordOverride(db, orgId, existing, resolution.note);
  }

  if (resolution.status === "approved") {
    await recordMemory(db, orgId, {
      kind: "decision",
      subject: existing.proposedAction.action,
      content: `Approved ${existing.proposedAction.action} for ${existing.proposedAction.targetNodeKey || "unknown"}`,
      source: {
        type: "approval",
        actor: resolution.resolvedBy || "operator",
        refId: existing._id,
      },
      tags: [
        existing.proposedAction.action.split(".")[0] || "general",
        "decision",
      ],
    });
    await executeApprovedAction(
      store,
      orgId,
      existing.proposedAction,
      resolution.resolvedBy,
      deps,
    );
  }

  return updated;
}

export class ApprovalDeniedError extends Error {
  evaluation: EvaluateOutcome;

  constructor(evaluation: EvaluateOutcome) {
    super("Policy denied proposed action");
    this.name = "ApprovalDeniedError";
    this.evaluation = evaluation;
  }
}

export class ApprovalNotFoundError extends Error {
  constructor(id: string) {
    super(`Approval not found: ${id}`);
    this.name = "ApprovalNotFoundError";
  }
}

export class ApprovalAlreadyResolvedError extends Error {
  constructor(id: string) {
    super(`Approval already resolved: ${id}`);
    this.name = "ApprovalAlreadyResolvedError";
  }
}
