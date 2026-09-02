import type { ProposedAction } from "@karya/policy";
import type { ToolContext } from "../types.js";

function propNumber(
  props: Record<string, string | number | boolean | null>,
  key: string,
): number {
  const value = props[key];
  return typeof value === "number" ? value : 0;
}

export async function moneyCreatePaymentLink(
  ctx: ToolContext,
  input: { invoiceKey: string; explanation: string },
) {
  if (ctx.skipPolicy) {
    const result = await ctx.createPaymentLink({ invoiceKey: input.invoiceKey });
    return {
      status: "created" as const,
      paymentKey: result.paymentNode.key,
      shortUrl: result.razorpay.short_url,
    };
  }

  const invoice = await ctx.store.getNodeByKey(ctx.orgId, input.invoiceKey);
  if (!invoice || invoice.type !== "Invoice") {
    throw new Error(`Invoice not found: ${input.invoiceKey}`);
  }

  const amountInPaise = propNumber(invoice.props, "amountInPaise");
  const proposed: ProposedAction = {
    action: "collect.invoice",
    orgId: ctx.orgId,
    targetNodeKey: input.invoiceKey,
    amountInPaise,
    explanation: input.explanation,
    proposedBy: "agent:governor",
  };

  const evaluation = await ctx.evaluateAction(proposed);

  await ctx.writeAudit({
    eventType: "policy.evaluated",
    sideEffectClass: "read",
    payload: { proposed, evaluation },
  });

  if (evaluation.finalDecision === "deny") {
    return { status: "denied" as const, evaluation };
  }

  if (evaluation.finalDecision === "require_approval") {
    const created = await ctx.createApproval(proposed);
    if ("autoAllowed" in created) {
      const result = await ctx.createPaymentLink({
        invoiceKey: input.invoiceKey,
      });
      return {
        status: "created" as const,
        paymentKey: result.paymentNode.key,
        shortUrl: result.razorpay.short_url,
      };
    }
    return {
      status: "awaiting_approval" as const,
      approvalId: created.approval._id,
      message:
        "Approval card created. Execution continues when operator approves.",
    };
  }

  // Only treat active (non-terminal) payments as blocking — expired/failed may be retried.
  const edges = await ctx.store.listEdges(ctx.orgId);
  const existingPayments = await ctx.store.listNodes(ctx.orgId, "Payment");
  const activePayment = existingPayments.find(
    (p) =>
      (p.props.status === "sent" || p.props.status === "captured") &&
      edges.some(
        (e) =>
          e.type === "PAYS" &&
          e.fromId === p._id &&
          e.toId === invoice._id &&
          e.validTo === null,
      ),
  );
  if (activePayment) {
    return {
      status: "exists" as const,
      paymentKey: activePayment.key,
      shortUrl:
        typeof activePayment.props.short_url === "string"
          ? activePayment.props.short_url
          : undefined,
    };
  }

  const result = await ctx.createPaymentLink({ invoiceKey: input.invoiceKey });
  return {
    status: "created" as const,
    paymentKey: result.paymentNode.key,
    shortUrl: result.razorpay.short_url,
  };
}
