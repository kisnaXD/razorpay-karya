import type { GraphStore } from "@karya/graph";
import type { ProposedAction } from "@karya/policy";
import { classifyPaymentFailure } from "./classify-failure.js";
import {
  buildFailureImpactCopy,
  loadFailureImpact,
  type FailureImpact,
} from "./impact-copy.js";
import {
  buildRecoveryProposals,
  recoveryOptionExplanation,
  type RecoveryProposal,
} from "./recovery-options.js";

export type CreateApprovalFn = (
  proposed: ProposedAction,
) => Promise<{ approval: { _id: string } } | { autoAllowed: true }>;

export type WriteAuditFn = (input: {
  eventType: string;
  sideEffectClass: "read" | "draft" | "write" | "money" | "external";
  payload: Record<string, unknown>;
  aboutNodeIds?: string[];
}) => Promise<unknown>;

export type FindPendingRecoveryApprovalsFn = (
  paymentKey: string,
) => Promise<string[]>;

export type HandlePaymentFailureResult = {
  impact: FailureImpact;
  proposals: RecoveryProposal[];
  approvalIds: string[];
  status: "created" | "already_pending";
};

/**
 * Post-webhook orchestration: classify → impact → recovery approvals → audit.
 * Idempotent: re-entry with pending money.recovery approvals returns already_pending.
 */
export async function handlePaymentFailure(
  store: GraphStore,
  orgId: string,
  paymentKey: string,
  webhookEvent: string,
  deps: {
    createApproval: CreateApprovalFn;
    writeAudit: WriteAuditFn;
    findPendingRecoveryApprovals?: FindPendingRecoveryApprovalsFn;
  },
): Promise<HandlePaymentFailureResult> {
  const payment = await store.getNodeByKey(orgId, paymentKey);
  if (!payment || payment.type !== "Payment") {
    throw new Error(`Payment not found: ${paymentKey}`);
  }

  // Idempotency: pending money.recovery approvals win. recovery_pending is a
  // fallback when the approvals lookup isn't wired (e.g. unit tests).
  if (deps.findPendingRecoveryApprovals) {
    const existingIds = await deps.findPendingRecoveryApprovals(paymentKey);
    if (existingIds.length > 0) {
      const impact = await loadFailureImpact(store, orgId, payment._id);
      const proposals = buildRecoveryProposals(impact);
      return {
        impact,
        proposals,
        approvalIds: existingIds,
        status: "already_pending",
      };
    }
  } else if (payment.props.recovery_pending === true) {
    const impact = await loadFailureImpact(store, orgId, payment._id);
    const proposals = buildRecoveryProposals(impact);
    return {
      impact,
      proposals,
      approvalIds: [],
      status: "already_pending",
    };
  }

  const failureClass = classifyPaymentFailure(payment, webhookEvent);
  const failureAt = new Date().toISOString();

  await store.upsertNode({
    _id: payment._id,
    orgId: payment.orgId,
    type: payment.type,
    key: payment.key,
    label: payment.label,
    props: {
      ...payment.props,
      failure_class: failureClass,
      failure_at: failureAt,
      status:
        typeof payment.props.status === "string"
          ? payment.props.status
          : failureClass === "expired"
            ? "expired"
            : "failed",
    },
  });

  const impact = await loadFailureImpact(store, orgId, payment._id);
  const proposals = buildRecoveryProposals(impact);
  const approvalIds: string[] = [];

  for (const proposal of proposals) {
    const optionSentence = recoveryOptionExplanation(proposal);
    const proposed: ProposedAction = {
      action: "money.recovery",
      orgId,
      amountInPaise: proposal.amountInPaise,
      targetNodeKey: proposal.salesOrderKey || proposal.invoiceKey,
      explanation: `${proposal.impactSummary} ${optionSentence}`,
      proposedBy: "agent:money",
      metadata: {
        option: proposal.option,
        paymentKey: proposal.paymentKey,
        invoiceKey: proposal.invoiceKey,
        salesOrderKey: proposal.salesOrderKey,
        stockKey: proposal.stockKey,
        leadKey: proposal.leadKey,
        impactSummary: proposal.impactSummary,
      },
    };

    const created = await deps.createApproval(proposed);
    if ("approval" in created) {
      approvalIds.push(created.approval._id);
    }
  }

  const refreshed = await store.getNodeByKey(orgId, paymentKey);
  if (refreshed) {
    await store.upsertNode({
      _id: refreshed._id,
      orgId: refreshed.orgId,
      type: refreshed.type,
      key: refreshed.key,
      label: refreshed.label,
      props: {
        ...refreshed.props,
        recovery_pending: true,
      },
    });
  }

  await deps.writeAudit({
    eventType: "money.failure_detected",
    sideEffectClass: "write",
    payload: {
      paymentKey,
      webhookEvent,
      failureClass,
      approvalIds,
      impactCopy: buildFailureImpactCopy(impact),
    },
    aboutNodeIds: [
      impact.payment._id,
      ...(impact.invoice ? [impact.invoice._id] : []),
      ...(impact.salesOrder ? [impact.salesOrder._id] : []),
    ],
  });

  return { impact, proposals, approvalIds, status: "created" };
}
