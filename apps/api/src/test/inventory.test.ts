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
import { ensureApprovalIndexes } from "../mongo.js";
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
  db = client.db("karya_inventory_test");
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
  await ensureApprovalIndexes(db);
  app = await buildApp({ store, db, env: testEnv, logger: false });
  await app.inject({
    method: "POST",
    url: "/v1/admin/seed",
    headers: { "x-org-id": ORG },
  });
});

describe("POST /v1/inventory/promise", () => {
  it("returns yes_if for 8× Diya-Large with PO-104 blocker", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/inventory/promise",
      headers: { "x-org-id": ORG, "content-type": "application/json" },
      payload: { skuKey: "SKU:Diya-Large", qty: 8 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      result: {
        verdict: string;
        available: number;
        blockers: { nodeKey: string }[];
      };
    };
    expect(body.result.verdict).toBe("yes_if");
    expect(body.result.available).toBe(3);
    expect(
      body.result.blockers.some((b) => b.nodeKey === "PurchaseOrder:PO-104"),
    ).toBe(true);
  });

  it("returns yes when qty fits available", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/inventory/promise",
      headers: { "x-org-id": ORG, "content-type": "application/json" },
      payload: { skuKey: "SKU:Diya-Large", qty: 3 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { result: { verdict: string } };
    expect(body.result.verdict).toBe("yes");
  });
});
