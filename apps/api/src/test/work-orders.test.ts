import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { GraphStore } from "@karya/graph";
import { ensureWorkOrderIndexes } from "../services/work-orders.js";
import { buildApp } from "../app.js";
import type { Env } from "../env.js";
import type { FastifyInstance } from "fastify";

const ORG = "org_arka";

const testEnv: Env = {
  MONGO_URL: "mongodb://unused",
  API_PORT: 4000,
  WEB_ORIGIN: "http://localhost:3000",
  NODE_ENV: "development",
  PAYOUT_PROVIDER: "ledger",
  A2A_ORG_ID: "org_arka",
  OPENAI_MODEL: "gpt-4o-mini",
  LLM_COPY_ENABLED: false,
  BROWSER_ENABLED: false,
};

let mongo: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let store: GraphStore;
let app: FastifyInstance;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  client = new MongoClient(mongo.getUri());
  await client.connect();
  db = client.db("karya_work_orders_test");
});

afterAll(async () => {
  await app?.close();
  await client.close();
  await mongo.stop();
});

beforeEach(async () => {
  await db.dropDatabase();
  store = new GraphStore(db);
  await store.ensureIndexes();
  await ensureWorkOrderIndexes(db);
  app = await buildApp({ store, db, env: testEnv, logger: false });
});

function orgHeaders(extra: Record<string, string> = {}) {
  return { "x-org-id": ORG, "content-type": "application/json", ...extra };
}

describe("work orders API", () => {
  it("creates, lists, and transitions a work order", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/v1/work-orders",
      headers: orgHeaders(),
      payload: {
        itemKey: "SKU:Diya-Large",
        itemName: "Diya-Large",
        quantity: 100,
        plannedMaterialCostPaise: 100000,
        plannedOperationCostPaise: 50000,
      },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json().workOrder;
    expect(created.woNo).toMatch(/^WO-\d{4}-\d{4}$/);
    expect(created.status).toBe("draft");

    const list = await app.inject({
      method: "GET",
      url: "/v1/work-orders",
      headers: orgHeaders(),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().workOrders).toHaveLength(1);

    const toNotStarted = await app.inject({
      method: "POST",
      url: `/v1/work-orders/${created._id}/status`,
      headers: orgHeaders(),
      payload: { status: "not_started" },
    });
    expect(toNotStarted.statusCode).toBe(200);
    expect(toNotStarted.json().workOrder.status).toBe("not_started");

    const bad = await app.inject({
      method: "POST",
      url: `/v1/work-orders/${created._id}/status`,
      headers: orgHeaders(),
      payload: { status: "completed" },
    });
    expect(bad.statusCode).toBe(409);
  });

  it("updates job card status", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/v1/work-orders",
      headers: orgHeaders(),
      payload: {
        itemKey: "SKU:Diya-Large",
        itemName: "Diya-Large",
        quantity: 50,
        jobCards: [
          {
            jcId: "jc_1",
            jcNo: "JC-1",
            operationName: "Buffing",
            workCenter: "Finishing",
            assignedTo: null,
            status: "open",
            forQuantity: 50,
            completedQty: 0,
            timeMinutes: 0,
          },
        ],
      },
    });
    const wo = create.json().workOrder;

    const res = await app.inject({
      method: "POST",
      url: `/v1/work-orders/${wo._id}/job-cards/jc_1/status`,
      headers: orgHeaders(),
      payload: { status: "wip", completedQty: 10 },
    });
    expect(res.statusCode).toBe(200);
    const jc = res.json().workOrder.jobCards[0];
    expect(jc.status).toBe("wip");
    expect(jc.completedQty).toBe(10);
  });
});
