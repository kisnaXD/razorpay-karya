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

const vendorPayout = {
  action: "pay.vendor",
  orgId: ORG,
  amountInPaise: 2000000,
  targetNodeKey: "Org:Meenakshi-Brass",
  explanation: "Pay PO-104 partial",
  proposedBy: "agent:money",
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
  db = client.db("karya_approvals_test");
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

function orgHeaders(extra: Record<string, string> = {}) {
  return { "x-org-id": ORG, ...extra };
}

describe("POST /v1/approvals", () => {
  it("creates pending approval for require_approval decision", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/approvals",
      headers: orgHeaders({ "content-type": "application/json" }),
      payload: { proposedAction: vendorPayout },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      approval: { status: string; _id: string };
    };
    expect(body.approval.status).toBe("pending");
    expect(body.approval._id.startsWith("appr_")).toBe(true);

    const events = await store.listNodes(ORG, "Event");
    expect(
      events.some((e) => e.props.event_type === "approval.created"),
    ).toBe(true);
  });

  it("returns pending approval for collect.invoice on overdue invoice", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/approvals",
      headers: orgHeaders({ "content-type": "application/json" }),
      payload: {
        proposedAction: {
          action: "collect.invoice",
          orgId: ORG,
          amountInPaise: 1480000,
          targetNodeKey: "Invoice:INV-90",
          explanation: "Payment Link for INV-90",
          proposedBy: "agent:money",
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      autoAllowed?: boolean;
      approval?: { status: string };
    };
    expect(body.autoAllowed).toBeUndefined();
    expect(body.approval?.status).toBe("pending");
  });
});

describe("GET /v1/approvals", () => {
  it("lists pending approvals", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/approvals",
      headers: orgHeaders({ "content-type": "application/json" }),
      payload: { proposedAction: vendorPayout },
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/approvals?status=pending",
      headers: orgHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { approvals: unknown[] };
    expect(body.approvals.length).toBe(1);
  });
});

describe("POST /v1/approvals/:id/resolve", () => {
  it("resolves approval and writes audit event", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/approvals",
      headers: orgHeaders({ "content-type": "application/json" }),
      payload: { proposedAction: vendorPayout },
    });
    const { approval } = created.json() as {
      approval: { _id: string };
    };

    const res = await app.inject({
      method: "POST",
      url: `/v1/approvals/${approval._id}/resolve`,
      headers: orgHeaders({ "content-type": "application/json" }),
      payload: {
        status: "approved",
        resolvedBy: "human:anika@arka.atelier",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { approval: { status: string } };
    expect(body.approval.status).toBe("approved");

    const events = await store.listNodes(ORG, "Event");
    expect(
      events.some((e) => e.props.event_type === "approval.resolved"),
    ).toBe(true);
  });
});

describe("GET /v1/approvals/:id", () => {
  it("returns approval by id", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/approvals",
      headers: orgHeaders({ "content-type": "application/json" }),
      payload: { proposedAction: vendorPayout },
    });
    const { approval } = created.json() as {
      approval: { _id: string };
    };

    const res = await app.inject({
      method: "GET",
      url: `/v1/approvals/${approval._id}`,
      headers: orgHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { approval: { _id: string } };
    expect(body.approval._id).toBe(approval._id);
  });
});
