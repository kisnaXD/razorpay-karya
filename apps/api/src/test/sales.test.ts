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
  db = client.db("karya_sales_test");
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

describe("GET /v1/sales/orders", () => {
  it("returns SO-218 and SO-201 with statuses", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/sales/orders",
      headers: { "x-org-id": ORG },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      orders: { key: string; status: string }[];
    };
    const keys = body.orders.map((o) => o.key);
    expect(keys).toContain("SalesOrder:SO-218");
    expect(keys).toContain("SalesOrder:SO-201");
    const so218 = body.orders.find((o) => o.key === "SalesOrder:SO-218");
    expect(so218?.status).toBe("promised");
  });
});

describe("POST /v1/sales/accept", () => {
  it("creates SalesOrder and reserves stock", async () => {
    const before = await store.getNodeByKey(ORG, "Stock:Diya-Large@Workshop");
    const reservedBefore =
      typeof before?.props.reserved === "number" ? before.props.reserved : 0;

    const res = await app.inject({
      method: "POST",
      url: "/v1/sales/accept",
      headers: {
        "x-org-id": ORG,
        "x-actor": "human:anika@arka.atelier",
        "content-type": "application/json",
      },
      payload: {
        customerOrgKey: "Org:Lotus-Boutique",
        skuKey: "SKU:Diya-Large",
        qty: 2,
        promiseDate: "Friday",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      salesOrder: { key: string; props: { status: string } };
      promiseResult: { verdict: string };
    };
    expect(body.salesOrder.key).toMatch(/^SalesOrder:SO-/);
    expect(body.salesOrder.props.status).toBe("promised");
    expect(body.promiseResult.verdict).toBe("yes");

    const after = await store.getNodeByKey(ORG, "Stock:Diya-Large@Workshop");
    expect(after?.props.reserved).toBe(reservedBefore + 2);
  });

  it("rejects when promise is no", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/sales/accept",
      headers: {
        "x-org-id": ORG,
        "x-actor": "human:anika@arka.atelier",
        "content-type": "application/json",
      },
      payload: {
        customerOrgKey: "Org:Lotus-Boutique",
        skuKey: "SKU:Diya-Large",
        qty: 200,
        promiseDate: "Friday",
      },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: string };
    expect(body.error).toBe("promise_rejected");
  });
});
