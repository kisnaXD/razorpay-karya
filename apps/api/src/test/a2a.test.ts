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
  id: "plink_a2a_test",
  short_url: "https://rzp.io/i/a2atest",
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
  db = client.db("karya_a2a_test");
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

function mockRazorpayFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockRazorpayLink,
    }),
  );
}

describe("/a2a routes", () => {
  it("GET /a2a/catalog returns Diya-Large under ₹2000 with availability", async () => {
    const res = await app.inject({ method: "GET", url: "/a2a/catalog" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      merchant: { orgId: string; name: string };
      items: Array<{
        skuKey: string;
        priceInPaise: number;
        availableQty: number;
        gstRatePercent: number;
      }>;
    };
    expect(body.merchant.orgId).toBe(ORG);
    const diya = body.items.find((i) => i.skuKey === "SKU:Diya-Large");
    expect(diya).toBeDefined();
    expect(diya!.priceInPaise).toBeLessThanOrEqual(200000);
    expect(diya!.availableQty).toBe(3);
    expect(diya!.gstRatePercent).toBe(12);
  });

  it("/a2a routes do not require x-org-id", async () => {
    const res = await app.inject({ method: "GET", url: "/a2a/catalog" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).not.toHaveProperty("error");
  });

  it("POST checkout session + complete creates SalesOrder and reserves stock", async () => {
    mockRazorpayFetch();

    const stockBefore = await store.getNodeByKey(
      ORG,
      "Stock:Diya-Large@Workshop",
    );
    const reservedBefore = Number(stockBefore!.props.reserved ?? 0);

    const createRes = await app.inject({
      method: "POST",
      url: "/a2a/checkout/sessions",
      headers: { "content-type": "application/json" },
      payload: {
        lineItems: [{ skuKey: "SKU:Diya-Large", quantity: 1 }],
        buyer: {
          name: "Demo UAP Buyer",
          email: "buyer@agent.example",
          agentId: "karya-demo-buyer",
        },
        fulfillment: { type: "ship" },
      },
    });
    expect(createRes.statusCode).toBe(200);
    const { session } = createRes.json() as {
      session: { id: string; totals: { totalInPaise: number } };
    };
    expect(session.totals.totalInPaise).toBe(207200);

    const completeRes = await app.inject({
      method: "POST",
      url: `/a2a/checkout/sessions/${session.id}/complete`,
      headers: { "content-type": "application/json" },
      payload: {},
    });
    expect(completeRes.statusCode).toBe(200);
    const complete = completeRes.json() as {
      order: { orderKey: string; status: string };
      payment: { paymentLinkId: string; shortUrl: string };
    };
    expect(complete.order.orderKey).toMatch(/^SalesOrder:SO-A2A-/);
    expect(complete.order.status).toBe("pending_payment");
    expect(complete.payment.paymentLinkId).toBe("plink_a2a_test");
    expect(complete.payment.shortUrl).toBe("https://rzp.io/i/a2atest");

    const salesOrder = await store.getNodeByKey(ORG, complete.order.orderKey);
    expect(salesOrder).toBeDefined();
    expect(salesOrder!.props.channel).toBe("a2a");
    expect(salesOrder!.props.status).toBe("pending_payment");

    const stockAfter = await store.getNodeByKey(
      ORG,
      "Stock:Diya-Large@Workshop",
    );
    expect(Number(stockAfter!.props.reserved)).toBe(reservedBefore + 1);

    const payment = await store.getNodeByKey(ORG, "Payment:plink_a2a_test");
    expect(payment).toBeDefined();
    expect(payment!.props.short_url).toBe("https://rzp.io/i/a2atest");

    const events = await store.listNodes(ORG, "Event");
    expect(
      events.filter((e) =>
        ["a2a.checkout.session_created", "a2a.checkout.completed"].includes(
          String(e.props.event_type),
        ),
      ).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("idempotent complete returns same payment link without double-reserving", async () => {
    mockRazorpayFetch();

    const createRes = await app.inject({
      method: "POST",
      url: "/a2a/checkout/sessions",
      headers: { "content-type": "application/json" },
      payload: {
        lineItems: [{ skuKey: "SKU:Diya-Large", quantity: 1 }],
      },
    });
    const { session } = createRes.json() as { session: { id: string } };

    const first = await app.inject({
      method: "POST",
      url: `/a2a/checkout/sessions/${session.id}/complete`,
      headers: { "content-type": "application/json" },
      payload: {},
    });
    expect(first.statusCode).toBe(200);

    const stockMid = await store.getNodeByKey(ORG, "Stock:Diya-Large@Workshop");
    const reservedMid = Number(stockMid!.props.reserved);

    const second = await app.inject({
      method: "POST",
      url: `/a2a/checkout/sessions/${session.id}/complete`,
      headers: { "content-type": "application/json" },
      payload: {},
    });
    expect(second.statusCode).toBe(200);
    const body = second.json() as {
      payment: { paymentLinkId: string };
    };
    expect(body.payment.paymentLinkId).toBe("plink_a2a_test");

    const stockEnd = await store.getNodeByKey(ORG, "Stock:Diya-Large@Workshop");
    expect(Number(stockEnd!.props.reserved)).toBe(reservedMid);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("GET /a2a/orders/:sessionId returns pending_payment", async () => {
    mockRazorpayFetch();

    const createRes = await app.inject({
      method: "POST",
      url: "/a2a/checkout/sessions",
      headers: { "content-type": "application/json" },
      payload: {
        lineItems: [{ skuKey: "SKU:Diya-Large", quantity: 1 }],
      },
    });
    const { session } = createRes.json() as { session: { id: string } };

    await app.inject({
      method: "POST",
      url: `/a2a/checkout/sessions/${session.id}/complete`,
      headers: { "content-type": "application/json" },
      payload: {},
    });

    const orderRes = await app.inject({
      method: "GET",
      url: `/a2a/orders/${session.id}`,
    });
    expect(orderRes.statusCode).toBe(200);
    const body = orderRes.json() as {
      order: { status: string; sessionId: string };
    };
    expect(body.order.sessionId).toBe(session.id);
    expect(body.order.status).toBe("pending_payment");
  });

  it("complete returns 503 when razorpay not configured", async () => {
    const noRpEnv: Env = {
      ...testEnv,
      RAZORPAY_KEY_ID: undefined,
      RAZORPAY_KEY_SECRET: undefined,
    };
    await app.close();
    app = await buildApp({ store, db, env: noRpEnv, logger: false });

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
    expect(completeRes.statusCode).toBe(503);
    expect(completeRes.json()).toEqual({ error: "razorpay_not_configured" });
  });
});
