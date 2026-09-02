import { randomUUID } from "node:crypto";
import type { GraphStore, NodeRecord } from "@karya/graph";
import { newEdgeId, newNodeId } from "@karya/graph";

export type SideEffectClass = "read" | "draft" | "write" | "money" | "external";

export type AuditEventInput = {
  orgId: string;
  eventType: string;
  actor: string;
  sideEffectClass: SideEffectClass;
  payload: Record<string, unknown>;
  aboutNodeIds?: string[];
};

export async function writeAuditEvent(
  store: GraphStore,
  input: AuditEventInput,
): Promise<NodeRecord> {
  const key = `Event:${input.eventType}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const node = await store.upsertNode({
    _id: newNodeId(),
    orgId: input.orgId,
    type: "Event",
    key,
    label: input.eventType,
    props: {
      event_type: input.eventType,
      actor: input.actor,
      side_effect_class: input.sideEffectClass,
      payload_json: JSON.stringify(input.payload),
      at: new Date().toISOString(),
    },
  });

  for (const aboutId of input.aboutNodeIds ?? []) {
    await store.writeEdge({
      _id: newEdgeId(),
      orgId: input.orgId,
      type: "CAUSED",
      fromId: node._id,
      toId: aboutId,
      props: {},
      validFrom: new Date(),
    });
  }

  return node;
}

export async function listAuditEvents(
  store: GraphStore,
  orgId: string,
  filter?: {
    actor?: string;
    sideEffectClass?: SideEffectClass;
    minAmountPaise?: number;
    limit?: number;
  },
): Promise<NodeRecord[]> {
  const events = await store.listNodes(orgId, "Event");
  let filtered = events.sort(
    (a, b) =>
      new Date(String(b.props.at)).getTime() -
      new Date(String(a.props.at)).getTime(),
  );
  if (filter?.actor) {
    filtered = filtered.filter((e) => e.props.actor === filter.actor);
  }
  if (filter?.sideEffectClass) {
    filtered = filtered.filter(
      (e) => e.props.side_effect_class === filter.sideEffectClass,
    );
  }
  if (filter?.minAmountPaise !== undefined) {
    const min = filter.minAmountPaise;
    filtered = filtered.filter((e) => {
      const raw = e.props.payload_json;
      if (typeof raw !== "string") return false;
      try {
        const payload = JSON.parse(raw) as {
          amountInPaise?: number;
          amount?: number;
        };
        const amount = payload.amountInPaise ?? payload.amount;
        return typeof amount === "number" && amount >= min;
      } catch {
        return false;
      }
    });
  }
  const limit = filter?.limit ?? 50;
  return filtered.slice(0, limit);
}
