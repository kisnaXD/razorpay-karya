import type { ToolContext } from "../types.js";
import { classifyPaymentFailure } from "./classify-failure.js";
import { runCollectionsLoop } from "./collections-loop.js";
import { handlePaymentFailure } from "./handle-failure.js";
import {
  buildFailureImpactCopy,
  loadFailureImpact,
} from "./impact-copy.js";
import { moneyProposePayout } from "./payout-propose.js";
import { buildRecoveryProposals } from "./recovery-options.js";
import { moneyCreatePaymentLink } from "../tools/money.js";

export async function moneyListOverdueInvoices(
  ctx: ToolContext,
  _input: { explanation: string },
) {
  const exceptions = await ctx.store.exceptions(ctx.orgId);
  const overdue = exceptions.filter((e) => e.code === "invoice.overdue");
  const rows = [];
  for (const ex of overdue) {
    const node = await ctx.store.getNode(ctx.orgId, ex.nodeId);
    if (!node) continue;
    rows.push({
      invoiceKey: node.key,
      label: node.label,
      amountInPaise:
        typeof node.props.amountInPaise === "number"
          ? node.props.amountInPaise
          : 0,
      nudgeCount:
        typeof node.props.nudge_count === "number"
          ? node.props.nudge_count
          : 0,
      detail: ex.detail,
    });
  }
  return { overdue: rows };
}

export async function moneyProposeCollection(
  ctx: ToolContext,
  input: { invoiceKey: string; explanation: string },
) {
  return moneyCreatePaymentLink(
    { ...ctx, skipPolicy: false },
    { invoiceKey: input.invoiceKey, explanation: input.explanation },
  );
}

export async function moneyRunCollectionsLoop(
  ctx: ToolContext,
  _input: { explanation: string },
) {
  if (!ctx.runCollectionsLoop) {
    throw new Error("runCollectionsLoop not wired in ToolContext");
  }
  return ctx.runCollectionsLoop();
}

export async function moneyClassifyFailure(
  ctx: ToolContext,
  input: { paymentKey: string; webhookEvent?: string; explanation: string },
) {
  const payment = await ctx.store.getNodeByKey(ctx.orgId, input.paymentKey);
  if (!payment || payment.type !== "Payment") {
    throw new Error(`Payment not found: ${input.paymentKey}`);
  }
  const webhookEvent =
    input.webhookEvent ??
    (typeof payment.props.status === "string"
      ? payment.props.status === "expired"
        ? "payment_link.expired"
        : "payment.failed"
      : "payment.failed");
  const failureClass = classifyPaymentFailure(payment, webhookEvent);
  return { paymentKey: payment.key, failureClass, status: payment.props.status };
}

export async function moneyImpactQuery(
  ctx: ToolContext,
  input: { paymentKey: string; explanation: string },
) {
  const payment = await ctx.store.getNodeByKey(ctx.orgId, input.paymentKey);
  if (!payment) throw new Error(`Payment not found: ${input.paymentKey}`);
  const impact = await loadFailureImpact(ctx.store, ctx.orgId, payment._id);
  return {
    impact: {
      paymentKey: impact.payment.key,
      invoiceKey: impact.invoice?.key ?? null,
      salesOrderKey: impact.salesOrder?.key ?? null,
      buyerOrgKey: impact.buyerOrg?.key ?? null,
      stockKey: impact.stock?.key ?? null,
      skuKey: impact.sku?.key ?? null,
      leadKey: impact.lead?.key ?? null,
      promiseDate: impact.promiseDate,
      reservedQty: impact.reservedQty,
      amountInPaise: impact.amountInPaise,
    },
    copy: buildFailureImpactCopy(impact),
  };
}

export async function moneyProposeRecovery(
  ctx: ToolContext,
  input: { paymentKey: string; explanation: string },
) {
  if (!ctx.handlePaymentFailure) {
    // Fallback: create approvals via createApproval directly
    const payment = await ctx.store.getNodeByKey(ctx.orgId, input.paymentKey);
    if (!payment) throw new Error(`Payment not found: ${input.paymentKey}`);
    const impact = await loadFailureImpact(ctx.store, ctx.orgId, payment._id);
    const proposals = buildRecoveryProposals(impact);
    const approvalIds: string[] = [];
    for (const proposal of proposals) {
      const created = await ctx.createApproval({
        action: "money.recovery",
        orgId: ctx.orgId,
        amountInPaise: proposal.amountInPaise,
        targetNodeKey: proposal.salesOrderKey || proposal.invoiceKey,
        explanation: proposal.impactSummary,
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
      });
      if ("approval" in created) {
        approvalIds.push(created.approval._id);
      }
    }
    return { proposals, approvalIds };
  }
  return ctx.handlePaymentFailure(input.paymentKey, "payment_link.expired");
}

export async function moneyGetLedger(
  ctx: ToolContext,
  _input: { explanation: string },
) {
  if (!ctx.getLedger) {
    throw new Error("getLedger not wired in ToolContext");
  }
  return ctx.getLedger();
}

export { moneyProposePayout, moneyCreatePaymentLink, runCollectionsLoop, handlePaymentFailure };
