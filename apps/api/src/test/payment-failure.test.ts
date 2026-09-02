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
  db = client.db("karya_payment_failure_test");
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

describe("POST /v1/agents/money/handle-failure", () => {
  it("creates three recovery approvals with graph-backed why", async () => {
    const pay = await store.getNodeByKey(ORG, "Payment:plink_7");
    await store.upsertNode({
      ...pay!,
      props: { ...pay!.props, status: "expired" },
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/agents/money/handle-failure",
      headers: {
        "x-org-id": ORG,
        "content-type": "application/json",
      },
      payload: {
        paymentKey: "Payment:plink_7",
        webhookEvent: "payment_link.expired",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      approvalIds: string[];
      impactCopy: string;
      options: string[];
    };
    expect(body.approvalIds).toHaveLength(3);
    expect(body.options).toEqual([
      "retry_link",
      "hold_stock_48h",
      "release_to_lead",
    ]);
    expect(body.impactCopy).toContain("SO-218");
    expect(body.impactCopy).toContain("IG-Ananya");
  });

  it("is idempotent — second call does not create more approvals", async () => {
    const pay = await store.getNodeByKey(ORG, "Payment:plink_7");
    await store.upsertNode({
      ...pay!,
      props: { ...pay!.props, status: "expired" },
    });

    const payload = {
      paymentKey: "Payment:plink_7",
      webhookEvent: "payment_link.expired",
    };
    const headers = {
      "x-org-id": ORG,
      "content-type": "application/json",
    };

    const first = await app.inject({
      method: "POST",
      url: "/v1/agents/money/handle-failure",
      headers,
      payload,
    });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json() as { approvalIds: string[] };
    expect(firstBody.approvalIds).toHaveLength(3);

    const second = await app.inject({
      method: "POST",
      url: "/v1/agents/money/handle-failure",
      headers,
      payload,
    });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json() as { approvalIds: string[] };
    expect(secondBody.approvalIds).toHaveLength(3);
    expect([...secondBody.approvalIds].sort()).toEqual(
      [...firstBody.approvalIds].sort(),
    );

    const pending = await db.collection("approvals").countDocuments({
      orgId: ORG,
      status: "pending",
      "proposedAction.action": "money.recovery",
      "proposedAction.metadata.paymentKey": "Payment:plink_7",
    });
    expect(pending).toBe(3);
  });
});
