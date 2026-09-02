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
  db = client.db("karya_people_test");
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

describe("people routes", () => {
  it("timeline for Meenakshi includes PO-104, Vendor-Nudge, VendorCall-Thu", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/people/Org%3AMeenakshi-Brass/timeline",
      headers: { "x-org-id": ORG },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      entries: { nodeKey: string }[];
    };
    const keys = body.entries.map((e) => e.nodeKey);
    expect(keys).toContain("PurchaseOrder:PO-104");
    expect(keys).toContain("Message:Vendor-Nudge");
    expect(keys).toContain("Meeting:VendorCall-Thu");
    expect(body.entries.length).toBeGreaterThanOrEqual(3);
  });

  it("timeline for Lotus includes SO-218, INV-90, plink_7", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/people/Org%3ALotus-Boutique/timeline",
      headers: { "x-org-id": ORG },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      entries: { nodeKey: string }[];
    };
    const keys = body.entries.map((e) => e.nodeKey);
    expect(keys).toContain("SalesOrder:SO-218");
    expect(keys).toContain("Invoice:INV-90");
    expect(keys).toContain("Payment:plink_7");
  });
});
