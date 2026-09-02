import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
  RAZORPAY_KEY_ID: "rzp_test_key",
  RAZORPAY_KEY_SECRET: "rzp_test_secret",
  RAZORPAY_WEBHOOK_SECRET: "whsec_test",
  PAYOUT_PROVIDER: "ledger",
  A2A_ORG_ID: ORG,
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
  db = client.db("karya_ledger_test");
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

describe("GET /v1/ledger", () => {
  it("returns payments in from seeded plink_7", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/ledger",
      headers: { "x-org-id": ORG },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      entries: Array<{ direction: string; status: string }>;
      receivablesInPaise: number;
      cashInPaise: number;
    };
    expect(body.receivablesInPaise).toBe(1480000);
    expect(body.entries.some((e) => e.direction === "in")).toBe(true);
    expect(body.entries.find((e) => e.status === "sent")).toBeDefined();
  });
});
