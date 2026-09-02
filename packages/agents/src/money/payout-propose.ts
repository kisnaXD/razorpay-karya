import type { ProposedAction } from "@karya/policy";
import type { ToolContext } from "../types.js";

export async function moneyProposePayout(
  ctx: ToolContext,
  input: {
    vendorOrgKey: string;
    amountInPaise: number;
    explanation: string;
  },
) {
  const vendor = await ctx.store.getNodeByKey(ctx.orgId, input.vendorOrgKey);
  if (!vendor || vendor.type !== "Org") {
    throw new Error(`Vendor org not found: ${input.vendorOrgKey}`);
  }

  const proposed: ProposedAction = {
    action: "pay.vendor",
    orgId: ctx.orgId,
    targetNodeKey: input.vendorOrgKey,
    amountInPaise: input.amountInPaise,
    explanation: input.explanation,
    proposedBy: "agent:money",
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
      return { status: "auto_allowed" as const, evaluation };
    }
    return {
      status: "awaiting_approval" as const,
      approvalId: created.approval._id,
    };
  }

  return {
    status: "allowed" as const,
    evaluation,
    amountInPaise: input.amountInPaise,
  };
}
