import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GraphStore, newNodeId } from "@karya/graph";
import {
  acknowledgeEvents,
  ensureEventIndexes,
  getUnacknowledgedEvents,
  scanForEvents,
} from "../services/agent-events.js";

const ORG = "org_arka";

let mongo: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let store: GraphStore;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  client = new MongoClient(mongo.getUri());
  await client.connect();
  db = client.db("karya_agent_events_test");
  store = new GraphStore(db);
});

afterAll(async () => {
  await client.close();
  await mongo.stop();
});

beforeEach(async () => {
  await db.dropDatabase();
  await store.ensureIndexes();
  await ensureEventIndexes(db);
});

async function seedOverdueInvoice() {
  await store.upsertNode({
    _id: newNodeId(),
    orgId: ORG,
    type: "Invoice",
    key: "Invoice:INV-TEST-90",
    label: "INV-TEST-90",
    props: {
      status: "overdue",
      amountInPaise: 1480000,
      dueAt: "2020-01-01T00:00:00.000Z",
    },
  });
}

describe("agent-events", () => {
  it("scanForEvents detects new exceptions from overdue invoice", async () => {
    await seedOverdueInvoice();

    const events = await scanForEvents(db, store, ORG);

    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === "exception.new")).toBe(true);
    expect(events.every((e) => e.acknowledged === false)).toBe(true);
    expect(events.every((e) => e.orgId === ORG)).toBe(true);
  });

  it("scanning again with same state produces no new events", async () => {
    await seedOverdueInvoice();

    const first = await scanForEvents(db, store, ORG);
    expect(first.length).toBeGreaterThan(0);

    const second = await scanForEvents(db, store, ORG);
    expect(second).toEqual([]);
  });

  it("acknowledgeEvents marks events as read", async () => {
    await seedOverdueInvoice();
    await scanForEvents(db, store, ORG);

    const before = await getUnacknowledgedEvents(db, ORG);
    expect(before.unacknowledgedCount).toBeGreaterThan(0);

    const acknowledged = await acknowledgeEvents(db, ORG);
    expect(acknowledged).toBeGreaterThan(0);

    const after = await getUnacknowledgedEvents(db, ORG);
    expect(after.unacknowledgedCount).toBe(0);
    expect(after.events).toEqual([]);
  });

  it("getUnacknowledgedEvents returns correct count", async () => {
    await seedOverdueInvoice();
    await scanForEvents(db, store, ORG);

    const { events, unacknowledgedCount } = await getUnacknowledgedEvents(
      db,
      ORG,
    );

    expect(unacknowledgedCount).toBe(events.length);
    expect(unacknowledgedCount).toBeGreaterThan(0);
    expect(events.every((e) => e.acknowledged === false)).toBe(true);
  });
});
