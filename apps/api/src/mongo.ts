import { MongoClient, type Db } from "mongodb";
import { GraphStore } from "@karya/graph";
import { ensureAgentThreadIndexes } from "./services/agent-thread.js";
import { ensureMemoryIndexes } from "./services/agent-memory.js";
import { ensureEventIndexes } from "./services/agent-events.js";
import { ensureUserIndexes } from "./services/users.js";
import { ensureWorkOrderIndexes } from "./services/work-orders.js";
import { ensureBomIndexes } from "./services/boms.js";

export type MongoContext = {
  client: MongoClient;
  db: Db;
  store: GraphStore;
};

export async function ensureApprovalIndexes(db: Db): Promise<void> {
  await db
    .collection("approvals")
    .createIndex({ orgId: 1, status: 1, createdAt: -1 });
}

export async function ensureA2AIndexes(db: Db): Promise<void> {
  await db.collection("a2a_sessions").createIndex({ orgId: 1, createdAt: -1 });
}

export async function connectMongo(url: string): Promise<MongoContext> {
  const client = new MongoClient(url);
  await client.connect();
  const db = client.db();
  const store = new GraphStore(db);
  await store.ensureIndexes();
  await ensureApprovalIndexes(db);
  await ensureA2AIndexes(db);
  await ensureAgentThreadIndexes(db);
  await ensureMemoryIndexes(db);
  await ensureEventIndexes(db);
  await ensureBomIndexes(db);
  await ensureWorkOrderIndexes(db);
  await ensureUserIndexes(db);
  return { client, db, store };
}
