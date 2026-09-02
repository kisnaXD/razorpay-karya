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
let linkCounter = 0;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  client = new MongoClient(mongo.getUri());
  await client.connect();
  db = client.db("karya_approval_exec_test");
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
  linkCounter = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => {
      linkCounter += 1;
      return {
        ok: true,
        json: async () => ({
          id: `plink_retry_${linkCounter}`,
          short_url: `https://rzp.io/i/retry${linkCounter}`,
          amount: 1480000,
          currency: "INR",
          status: "created",
          created_at: 1700000000,
        }),
      };
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("approval execution hooks", () => {
  it("retry_link creates a new Payment node without double-charging", async () => {
    await app.inject({
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

    const list = await app.inject({
      method: "GET",
      url: "/v1/approvals?status=pending",
      headers: { "x-org-id": ORG },
    });
    const approvals = (
      list.json() as {
        approvals: Array<{
          _id: string;
          proposedAction: { metadata?: { option?: string } };
        }>;
      }
    ).approvals;
    const retry = approvals.find(
      (a) => a.proposedAction.metadata?.option === "retry_link",
    );
    expect(retry).toBeDefined();

    const resolve = await app.inject({
      method: "POST",
      url: `/v1/approvals/${retry!._id}/resolve`,
      headers: {
        "x-org-id": ORG,
        "content-type": "application/json",
      },
      payload: { status: "approved", resolvedBy: "human:anika" },
    });
    expect(resolve.statusCode).toBe(200);

    const payments = await store.listNodes(ORG, "Payment");
    const links = payments.filter(
      (p) => p.props.channel === "payment_link",
    );
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links.some((p) => p.key === "Payment:plink_7")).toBe(true);
    expect(links.some((p) => String(p.key).includes("plink_retry"))).toBe(
      true,
    );

    const invoice = await store.getNodeByKey(ORG, "Invoice:INV-90");
    expect(invoice!.props.nudge_count).toBe(2);
  });

  it("hold_stock_48h sets hold_until on stock", async () => {
    await app.inject({
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

    const list = await app.inject({
      method: "GET",
      url: "/v1/approvals?status=pending",
      headers: { "x-org-id": ORG },
    });
    const approvals = (
      list.json() as {
        approvals: Array<{
          _id: string;
          proposedAction: { metadata?: { option?: string } };
        }>;
      }
    ).approvals;
    const hold = approvals.find(
      (a) => a.proposedAction.metadata?.option === "hold_stock_48h",
    );

    await app.inject({
      method: "POST",
      url: `/v1/approvals/${hold!._id}/resolve`,
      headers: {
        "x-org-id": ORG,
        "content-type": "application/json",
      },
      payload: { status: "approved", resolvedBy: "human:anika" },
    });

    const stock = await store.getNodeByKey(ORG, "Stock:Diya-Large@Workshop");
    expect(typeof stock!.props.hold_until).toBe("string");
  });
});
