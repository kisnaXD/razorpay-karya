import type { Db } from "mongodb";
import type { GraphStore } from "@karya/graph";
import { runCollectionsLoop as agentsRunCollectionsLoop } from "@karya/agents";
import type { RazorpayClient } from "@karya/razorpay";
import { createApproval } from "./approvals.js";
import { writeAuditEvent } from "./audit.js";
import { evaluateAction } from "./policy.js";
import { createPaymentLinkForInvoice } from "./payment-links.js";

export async function runCollections(
  store: GraphStore,
  db: Db,
  client: RazorpayClient | null,
  orgId: string,
) {
  return agentsRunCollectionsLoop(store, orgId, {
    evaluate: (proposed) => evaluateAction(store, orgId, proposed),
    createApproval: (proposed) => createApproval(db, store, orgId, proposed),
    createLink: async ({ invoiceKey, actor }) => {
      if (!client) {
        throw new Error("razorpay_not_configured");
      }
      const result = await createPaymentLinkForInvoice(
        store,
        client,
        writeAuditEvent,
        { orgId, invoiceKey, actor: actor ?? "agent:money" },
      );
      return {
        paymentNode: { key: result.paymentNode.key },
        created: result.created,
      };
    },
    audit: (input) =>
      writeAuditEvent(store, {
        orgId,
        actor: "agent:money",
        eventType: input.eventType,
        sideEffectClass: input.sideEffectClass,
        payload: input.payload,
        ...(input.aboutNodeIds ? { aboutNodeIds: input.aboutNodeIds } : {}),
      }),
  });
}
