import { createHmac } from "node:crypto";
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
import { GraphStore, newEdgeId, newNodeId } from "@karya/graph";
import { ensureApprovalIndexes } from "../mongo.js";
import { buildApp } from "../app.js";
import type { Env } from "../env.js";
import type { FastifyInstance } from "fastify";

const ORG = "org_arka";
const WEBHOOK_SECRET = "whsec_test";

const testEnv: Env = {
  MONGO_URL: "mongodb://unused",
  API_PORT: 4000,
  WEB_ORIGIN: "http://localhost:3000",
  NODE_ENV: "development",
  RAZORPAY_KEY_ID: "rzp_test_key",
  RAZORPAY_KEY_SECRET: "rzp_test_secret",
  RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
  PAYOUT_PROVIDER: "ledger",
  A2A_ORG_ID: "org_arka",
  OPENAI_MODEL: "gpt-4o-mini",
};

const mockRazorpayLink = {
  id: "plink_test_new",
  short_url: "https://rzp.io/i/testnew",
  amount: 1480000,
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
  db = client.db("karya_payment_links_test");
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
});

afterEach(() => {
  vi.restoreAllMocks();
});

function orgHeaders(extra: Record<string, string> = {}) {
  return { "x-org-id": ORG, ...extra };
}

function mockRazorpayFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockRazorpayLink,
    }),
  );
}

describe("POST /v1/payment-links", () => {
  it("creates Payment node, audit Event, and PAYS edge", async () => {
    mockRazorpayFetch();

    await app.inject({
      method: "POST",
      url: "/v1/admin/seed",
      headers: orgHeaders(),
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/payment-links",
      headers: orgHeaders({ "content-type": "application/json" }),
      payload: { invoiceKey: "Invoice:INV-90" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      created: boolean;
      payment: { key: string; props: Record<string, unknown> };
    };
    expect(body.created).toBe(true);
    expect(body.payment.key).toBe("Payment:plink_test_new");
    expect(body.payment.props.razorpay_payment_link_id).toBe("plink_test_new");

    const payments = await store.listNodes(ORG, "Payment");
    const created = payments.find((p) => p.key === "Payment:plink_test_new");
    expect(created).toBeDefined();

    const events = await store.listNodes(ORG, "Event");
    expect(
      events.some((e) => e.props.event_type === "payment_link.created"),
    ).toBe(true);

    const invoice = await store.getNodeByKey(ORG, "Invoice:INV-90");
    const graph = await store.neighborhood(ORG, created!._id, 1);
    const paysEdge = graph.edges.find(
      (e) =>
        e.type === "PAYS" &&
        e.fromId === created!._id &&
        e.toId === invoice!._id,
    );
    expect(paysEdge).toBeDefined();
  });

  it("returns created: false on idempotent replay", async () => {
    mockRazorpayFetch();

    await app.inject({
      method: "POST",
      url: "/v1/admin/seed",
      headers: orgHeaders(),
    });

    const payload = { invoiceKey: "Invoice:INV-90" };
    const first = await app.inject({
      method: "POST",
      url: "/v1/payment-links",
      headers: orgHeaders({ "content-type": "application/json" }),
      payload,
    });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json() as {
      created: boolean;
      payment: { _id: string };
    };
    expect(firstBody.created).toBe(true);

    const second = await app.inject({
      method: "POST",
      url: "/v1/payment-links",
      headers: orgHeaders({ "content-type": "application/json" }),
      payload,
    });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json() as {
      created: boolean;
      payment: { _id: string };
    };
    expect(secondBody.created).toBe(false);
    expect(secondBody.payment._id).toBe(firstBody.payment._id);
  });

  it("returns 503 when Razorpay keys are missing", async () => {
    const noKeysApp = await buildApp({
      store,
      db,
      env: {
        ...testEnv,
        RAZORPAY_KEY_ID: undefined,
        RAZORPAY_KEY_SECRET: undefined,
      },
      logger: false,
    });

    const res = await noKeysApp.inject({
      method: "POST",
      url: "/v1/payment-links",
      headers: orgHeaders({ "content-type": "application/json" }),
      payload: { invoiceKey: "Invoice:INV-90" },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: "razorpay_not_configured" });
    await noKeysApp.close();
  });
});

describe("GET /v1/audit", () => {
  it("returns audit events newest-first", async () => {
    mockRazorpayFetch();

    await app.inject({
      method: "POST",
      url: "/v1/admin/seed",
      headers: orgHeaders(),
    });
    await app.inject({
      method: "POST",
      url: "/v1/payment-links",
      headers: orgHeaders({ "content-type": "application/json" }),
      payload: { invoiceKey: "Invoice:INV-90" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/audit?sideEffectClass=money&limit=10",
      headers: orgHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { events: { props: { side_effect_class: string } }[] };
    expect(body.events.length).toBeGreaterThanOrEqual(1);
    expect(body.events[0]!.props.side_effect_class).toBe("money");
  });
});
