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
import { ensureA2AIndexes, ensureApprovalIndexes } from "../mongo.js";
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

const mockRazorpayLink = {
  id: "plink_sim_test",
  short_url: "https://rzp.io/i/simtest",
  amount: 207200,
  currency: "INR",
  status: "created" as const,
  created_at: 1700000000,
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
  db = client.db("karya_simulate_webhook_test");
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
  await ensureA2AIndexes(db);
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

describe("POST /v1/admin/simulate-webhook", () => {
  it("paid simulation updates A2A SalesOrder to paid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockRazorpayLink,
      }),
    );

    const createRes = await app.inject({
      method: "POST",
      url: "/a2a/checkout/sessions",
      headers: { "content-type": "application/json" },
      payload: {
        lineItems: [{ skuKey: "SKU:Diya-Large", quantity: 1 }],
      },
    });
    const { session } = createRes.json() as { session: { id: string } };

    const completeRes = await app.inject({
      method: "POST",
      url: `/a2a/checkout/sessions/${session.id}/complete`,
      headers: { "content-type": "application/json" },
      payload: {},
    });
    const complete = completeRes.json() as {
      order: { orderKey: string };
      payment: { paymentLinkId: string };
    };

    const sim = await app.inject({
      method: "POST",
      url: "/v1/admin/simulate-webhook",
      headers: {
        "x-org-id": ORG,
        "content-type": "application/json",
      },
      payload: {
        event: "payment_link.paid",
        paymentLinkId: complete.payment.paymentLinkId,
      },
    });
    expect(sim.statusCode).toBe(200);
    expect(sim.json()).toMatchObject({
      received: true,
      dispatched: "payment_link.paid",
    });

    const salesOrder = await store.getNodeByKey(ORG, complete.order.orderKey);
    expect(salesOrder!.props.status).toBe("paid");
  });

  it("expired on plink_7 creates payment.failure + three recovery approvals", async () => {
    const sim = await app.inject({
      method: "POST",
      url: "/v1/admin/simulate-webhook",
      headers: {
        "x-org-id": ORG,
        "content-type": "application/json",
      },
      payload: {
        event: "payment_link.expired",
        paymentKey: "Payment:plink_7",
      },
    });
    expect(sim.statusCode).toBe(200);

    const payment = await store.getNodeByKey(ORG, "Payment:plink_7");
    expect(payment!.props.status).toBe("expired");

    const exceptions = await store.exceptions(ORG);
    expect(exceptions.some((e) => e.code === "payment.failure")).toBe(true);

    const approvals = await app.inject({
      method: "GET",
      url: "/v1/approvals?status=pending",
      headers: { "x-org-id": ORG },
    });
    const body = approvals.json() as {
      approvals: Array<{ proposedAction: { action: string; metadata?: { option?: string } } }>;
    };
    const recovery = body.approvals.filter(
      (a) => a.proposedAction.action === "money.recovery",
    );
    expect(recovery).toHaveLength(3);
    expect(recovery.map((a) => a.proposedAction.metadata?.option).sort()).toEqual(
      ["hold_stock_48h", "release_to_lead", "retry_link"].sort(),
    );
  });

  it("refuses outside development", async () => {
    await app.close();
    app = await buildApp({
      store,
      db,
      env: { ...testEnv, NODE_ENV: "production" },
      logger: false,
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/admin/simulate-webhook",
      headers: {
        "x-org-id": ORG,
        "content-type": "application/json",
      },
      payload: {
        event: "payment_link.paid",
        paymentLinkId: "plink_x",
      },
    });
    expect(res.statusCode).toBe(403);
  });
});
