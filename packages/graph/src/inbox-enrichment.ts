import type { Exception, InboxAction } from "./types.js";

const PAYMENT_RISK_CODES = new Set([
  "invoice.overdue",
  "payment.failure",
  "payment.uncollected",
  "collections.escalated",
]);

function extractAmount(detail: string): string | null {
  const match = detail.match(/₹[\d,]+(?:\.\d+)?/);
  return match ? match[0] : null;
}

function resolveNodeKey(ex: Exception): string {
  return ex.nodeKey ?? ex.nodeId;
}

function priorityFor(ex: Exception): NonNullable<Exception["priority"]> {
  if (ex.severity === "risk") {
    return PAYMENT_RISK_CODES.has(ex.code) ? "critical" : "high";
  }
  if (ex.severity === "warn") {
    return "medium";
  }
  return "low";
}

function actionsFor(
  code: Exception["code"],
  nodeKey: string,
): InboxAction[] {
  switch (code) {
    case "invoice.overdue":
      return [
        {
          id: "send-reminder",
          label: "Send reminder",
          kind: "agent_prompt",
          payload: {
            message: `Send a payment reminder for ${nodeKey}. Create a payment link if needed.`,
          },
        },
        {
          id: "view-invoice",
          label: "View invoice",
          kind: "navigate",
          payload: { nodeKey },
        },
      ];
    case "payment.failure":
      return [
        {
          id: "fix-payment",
          label: "Fix payment",
          kind: "agent_prompt",
          payload: {
            message: `Handle payment failure for ${nodeKey}. Check what went wrong and suggest recovery.`,
          },
        },
        {
          id: "view-details",
          label: "View details",
          kind: "navigate",
          payload: { nodeKey },
        },
      ];
    case "payment.uncollected":
      return [
        {
          id: "follow-up",
          label: "Follow up",
          kind: "agent_prompt",
          payload: {
            message: `Follow up on uncollected payment for ${nodeKey}`,
          },
        },
        {
          id: "view",
          label: "View",
          kind: "navigate",
          payload: { nodeKey },
        },
      ];
    case "po.late":
      return [
        {
          id: "chase-vendor",
          label: "Chase vendor",
          kind: "agent_prompt",
          payload: {
            message: `Draft a follow-up email to the vendor for late PO ${nodeKey}`,
          },
        },
        {
          id: "find-alternates",
          label: "Find alternates",
          kind: "agent_prompt",
          payload: {
            message: `Search for alternative vendors for the materials in ${nodeKey}`,
          },
        },
      ];
    case "shipment.delayed":
      return [
        {
          id: "investigate",
          label: "Investigate",
          kind: "agent_prompt",
          payload: {
            message: `Investigate the delay for ${nodeKey} and suggest alternatives`,
          },
        },
      ];
    case "stock.promise_risk":
      return [
        {
          id: "expedite-po",
          label: "Expedite PO",
          kind: "agent_prompt",
          payload: {
            message: `Create an urgent purchase order to fulfill the promise for ${nodeKey}`,
          },
        },
        {
          id: "view-order",
          label: "View order",
          kind: "navigate",
          payload: { nodeKey },
        },
      ];
    case "collections.escalated":
      return [
        {
          id: "draft-escalation",
          label: "Draft escalation",
          kind: "agent_prompt",
          payload: {
            message: `Draft an escalation email for ${nodeKey} — multiple reminders have been sent without payment`,
          },
        },
      ];
    default:
      return [];
  }
}

function enrichOne(ex: Exception): Exception {
  const nodeKey = resolveNodeKey(ex);
  const amount = extractAmount(ex.detail);
  const priority = priorityFor(ex);

  switch (ex.code) {
    case "invoice.overdue":
      return {
        ...ex,
        nodeKey,
        domain: "finance",
        priority,
        why: amount
          ? `${amount} payment overdue — affects cash flow`
          : "Payment overdue — affects cash flow",
        recommendation: "Send payment reminder to customer",
        actions: actionsFor(ex.code, nodeKey),
      };
    case "payment.failure":
      return {
        ...ex,
        nodeKey,
        domain: "finance",
        priority,
        why: "Payment failed — revenue at risk, reserved stock may need release",
        recommendation: "Investigate failure and retry or escalate",
        actions: actionsFor(ex.code, nodeKey),
      };
    case "payment.uncollected":
      return {
        ...ex,
        nodeKey,
        domain: "finance",
        priority,
        why: "Payment link sent but not yet collected",
        recommendation: "Follow up with customer",
        actions: actionsFor(ex.code, nodeKey),
      };
    case "po.late":
      return {
        ...ex,
        nodeKey,
        domain: "procurement",
        priority,
        why: "Purchase order overdue — may delay production",
        recommendation: "Chase vendor or find alternate supplier",
        actions: actionsFor(ex.code, nodeKey),
      };
    case "shipment.delayed":
      return {
        ...ex,
        nodeKey,
        domain: "procurement",
        priority,
        why: "Inbound shipment delayed — material arrival at risk",
        recommendation: "Check alternate suppliers or adjust timeline",
        actions: actionsFor(ex.code, nodeKey),
      };
    case "stock.promise_risk":
      return {
        ...ex,
        nodeKey,
        domain: "sales",
        priority,
        why: "Customer delivery promise at risk due to low stock",
        recommendation: "Expedite procurement or adjust promise date",
        actions: actionsFor(ex.code, nodeKey),
      };
    case "collections.escalated":
      return {
        ...ex,
        nodeKey,
        domain: "finance",
        priority,
        why: "Multiple reminders sent — needs manual follow-up",
        recommendation: "Call customer directly or escalate to sales",
        actions: actionsFor(ex.code, nodeKey),
      };
    default:
      return {
        ...ex,
        nodeKey,
        priority,
        domain: ex.domain ?? "inventory",
      };
  }
}

export function enrichExceptions(exceptions: Exception[]): Exception[] {
  return exceptions.map(enrichOne);
}
