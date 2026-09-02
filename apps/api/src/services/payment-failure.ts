import type { Db } from "mongodb";
import type { GraphStore } from "@karya/graph";
import {
  handlePaymentFailure as agentsHandlePaymentFailure,
  type HandlePaymentFailureResult,
} from "@karya/agents";
import { createApproval } from "./approvals.js";
import { writeAuditEvent } from "./audit.js";

export async function handlePaymentFailure(
  store: GraphStore,
  db: Db,
  orgId: string,
  paymentKey: string,
  webhookEvent: string,
): Promise<HandlePaymentFailureResult> {
  return agentsHandlePaymentFailure(store, orgId, paymentKey, webhookEvent, {
    createApproval: (proposed) => createApproval(db, store, orgId, proposed),
    writeAudit: (input) =>
      writeAuditEvent(store, {
        orgId,
        actor: "agent:money",
        eventType: input.eventType,
        sideEffectClass: input.sideEffectClass,
        payload: input.payload,
        ...(input.aboutNodeIds ? { aboutNodeIds: input.aboutNodeIds } : {}),
      }),
    findPendingRecoveryApprovals: async (key) => {
      const rows = await db
        .collection("approvals")
        .find({
          orgId,
          status: "pending",
          "proposedAction.action": "money.recovery",
          "proposedAction.metadata.paymentKey": key,
        })
        .sort({ createdAt: 1 })
        .project({ _id: 1 })
        .toArray();
      return rows.map((r) => String(r._id));
    },
  });
}
