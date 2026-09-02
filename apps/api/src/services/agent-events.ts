import type { Db } from "mongodb";
import { ulid } from "ulid";
import type { GraphStore } from "@karya/graph";

export type AgentEvent = {
  _id: string;
  orgId: string;
  type: "exception.new" | "exception.resolved";
  exceptionCode?: string;
  nodeKey?: string;
  title: string;
  detail?: string;
  createdAt: Date;
  acknowledged: boolean;
};

export type ExceptionSnapshot = {
  orgId: string;
  exceptionIds: string[];
  updatedAt: Date;
};

export async function ensureEventIndexes(db: Db): Promise<void> {
  const col = db.collection("agent_events");
  await col.createIndex({ orgId: 1, acknowledged: 1, createdAt: -1 });
  await col.createIndex({ orgId: 1, createdAt: -1 });
}

export async function scanForEvents(
  db: Db,
  store: GraphStore,
  orgId: string,
): Promise<AgentEvent[]> {
  const currentExceptions = await store.exceptions(orgId);
  const currentIds = new Set(currentExceptions.map((e) => e.id));

  const prevSnapshot = await db
    .collection<ExceptionSnapshot>("agent_event_state")
    .findOne({ orgId });
  const prevIds = new Set(prevSnapshot?.exceptionIds ?? []);

  const newEvents: AgentEvent[] = [];

  for (const ex of currentExceptions) {
    if (!prevIds.has(ex.id)) {
      const event: AgentEvent = {
        _id: `evt_${ulid()}`,
        orgId,
        type: "exception.new",
        exceptionCode: ex.code,
        title: ex.title,
        createdAt: new Date(),
        acknowledged: false,
      };
      if (ex.nodeKey !== undefined) {
        event.nodeKey = ex.nodeKey;
      }
      if (ex.why !== undefined || ex.detail !== undefined) {
        event.detail = ex.why ?? ex.detail;
      }
      newEvents.push(event);
    }
  }

  for (const prevId of prevIds) {
    if (!currentIds.has(prevId)) {
      newEvents.push({
        _id: `evt_${ulid()}`,
        orgId,
        type: "exception.resolved",
        title: `Issue resolved: ${prevId}`,
        createdAt: new Date(),
        acknowledged: false,
      });
    }
  }

  if (newEvents.length) {
    await db.collection<AgentEvent>("agent_events").insertMany(newEvents);
  }

  await db.collection("agent_event_state").updateOne(
    { orgId },
    { $set: { exceptionIds: [...currentIds], updatedAt: new Date() } },
    { upsert: true },
  );

  return newEvents;
}

export async function getUnacknowledgedEvents(
  db: Db,
  orgId: string,
): Promise<{
  events: AgentEvent[];
  unacknowledgedCount: number;
}> {
  const events = await db
    .collection<AgentEvent>("agent_events")
    .find({ orgId, acknowledged: false })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();
  return { events, unacknowledgedCount: events.length };
}

export async function acknowledgeEvents(
  db: Db,
  orgId: string,
): Promise<number> {
  const result = await db
    .collection("agent_events")
    .updateMany(
      { orgId, acknowledged: false },
      { $set: { acknowledged: true } },
    );
  return result.modifiedCount;
}
