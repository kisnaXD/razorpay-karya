import { createHmac } from "node:crypto";
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
import { GraphStore, newEdgeId, newNodeId } from "@karya/graph";
import { ensureApprovalIndexes } from "../mongo.js";
import { buildApp } from "../app.js";
import type { Env } from "../env.js";
import type { FastifyInstance } from "fastify";

const ORG = "org_arka";
const WEBHOOK_SECRET = "whsec_test";
const LINK_ID = "plink_webhook_test";

const testEnv: Env = {
  MONGO_URL: "mongodb://unused",
  API_PORT: 4000,
  WEB_ORIGIN: "http://localhost:3000",
  NODE_ENV: "development",
  RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
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
  db = client.db("karya_webhooks_test");
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

function sign(body: string): string {
  return createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
}

async function seedPaymentGraph() {
  const invoice = await store.upsertNode({
    _id: newNodeId(),
    orgId: ORG,
    type: "Invoice",
    key: "Invoice:INV-90",
    label: "INV-90",
    props: { status: "overdue", amountInPaise: 1480000 },
  });

  const payment = await store.upsertNode({
    _id: newNodeId(),
    orgId: ORG,
    type: "Payment",
    key: `Payment:${LINK_ID}`,
    label: LINK_ID,
    props: {
      status: "sent",
      channel: "payment_link",
      razorpay_payment_link_id: LINK_ID,
      amountInPaise: 1480000,
    },
  });

  await store.writeEdge({
    _id: newEdgeId(),
    orgId: ORG,
    type: "PAYS",
    fromId: payment._id,
    toId: invoice._id,
    props: {},
    validFrom: new Date(),
  });

  return { invoice, payment };
}

describe("POST /v1/webhooks/razorpay", () => {
  it("updates Payment to expired and writes audit Event", async () => {
    const { payment } = await seedPaymentGraph();

    const payload = JSON.stringify({
      event: "payment_link.expired",
      payload: {
        payment_link: {
          entity: {
            id: LINK_ID,
            short_url: "https://rzp.io/i/expired",
            amount: 1480000,
            currency: "INR",
            status: "expired",
            created_at: 1700000000,
            notes: { org_id: ORG },
          },
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/webhooks/razorpay",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": sign(payload),
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true });

    const updated = await store.getNode(ORG, payment._id);
    expect(updated?.props.status).toBe("expired");

    const events = await store.listNodes(ORG, "Event");
    expect(
      events.some((e) => e.props.event_type === "payment_link.expired"),
    ).toBe(true);
  });

  it("returns 401 for invalid signature without graph changes", async () => {
    const { payment } = await seedPaymentGraph();
    const eventsBefore = await store.listNodes(ORG, "Event");

    const payload = JSON.stringify({
      event: "payment_link.expired",
      payload: {
        payment_link: {
          entity: {
            id: LINK_ID,
            short_url: "https://rzp.io/i/expired",
            amount: 1480000,
            currency: "INR",
            status: "expired",
            created_at: 1700000000,
          },
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/webhooks/razorpay",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": "invalid_signature_value_0123456789abcdef",
      },
      payload,
    });

    expect(res.statusCode).toBe(401);

    const unchanged = await store.getNode(ORG, payment._id);
    expect(unchanged?.props.status).toBe("sent");

    const eventsAfter = await store.listNodes(ORG, "Event");
    expect(eventsAfter.length).toBe(eventsBefore.length);
  });

  it("ignores unknown events with 200", async () => {
    await seedPaymentGraph();

    const payload = JSON.stringify({
      event: "payment_link.unknown_event",
      payload: {},
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/webhooks/razorpay",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": sign(payload),
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true });
  });
});
