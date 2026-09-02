import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
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
  db = client.db("karya_collections_test");
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("collections loop", () => {
  it("skips INV-90 when sent link already exists", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/admin/run-collections",
      headers: { "x-org-id": ORG },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      processed: Array<{ invoiceKey: string; outcome: string }>;
    };
    const inv = body.processed.find((p) => p.invoiceKey === "Invoice:INV-90");
    expect(inv?.outcome).toBe("skipped");
  });

  it("escalates when nudge_count >= 3", async () => {
    const inv = await store.getNodeByKey(ORG, "Invoice:INV-90");
    await store.upsertNode({
      ...inv!,
      props: { ...inv!.props, nudge_count: 3 },
    });
    // expire existing link so skip path doesn't win
    const pay = await store.getNodeByKey(ORG, "Payment:plink_7");
    await store.upsertNode({
      ...pay!,
      props: { ...pay!.props, status: "expired" },
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/agents/money/tick",
      headers: { "x-org-id": ORG },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      processed: Array<{ invoiceKey: string; outcome: string }>;
    };
    expect(
      body.processed.find((p) => p.invoiceKey === "Invoice:INV-90")?.outcome,
    ).toBe("escalated");

    const refreshed = await store.getNodeByKey(ORG, "Invoice:INV-90");
    expect(refreshed!.props.collections_state).toBe("escalated");
  });
});
