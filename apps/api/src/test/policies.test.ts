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
  db = client.db("karya_policies_test");
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

describe("GET /v1/policies", () => {
  it("returns seeded policies with compiled rules", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/policies",
      headers: orgHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      policies: { node: { key: string }; compiled: { action: string } }[];
    };
    expect(body.policies.length).toBeGreaterThanOrEqual(2);
    const payVendor = body.policies.find(
      (p) => p.node.key === "Policy:pay.vendor",
    );
    expect(payVendor?.compiled.action).toBe("pay.vendor");
  });
});

describe("POST /v1/policies/evaluate", () => {
  it("returns require_approval for vendor payout within limit", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/policies/evaluate",
      headers: orgHeaders({ "content-type": "application/json" }),
      payload: {
        proposedAction: {
          action: "pay.vendor",
          orgId: ORG,
          amountInPaise: 2000000,
          targetNodeKey: "Org:Meenakshi-Brass",
          explanation: "Pay PO-104 partial",
          proposedBy: "agent:money",
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      evaluation: { finalDecision: string };
    };
    expect(body.evaluation.finalDecision).toBe("require_approval");
  });

  it("returns require_approval for payment link collection", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/policies/evaluate",
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
      evaluation: { finalDecision: string };
    };
    expect(body.evaluation.finalDecision).toBe("require_approval");
  });

  it("allows PO under ₹50k and requires approval over ₹5L", async () => {
    const under = await app.inject({
      method: "POST",
      url: "/v1/policies/evaluate",
      headers: orgHeaders({ "content-type": "application/json" }),
      payload: {
        proposedAction: {
          action: "po.create",
          orgId: ORG,
          amountInPaise: 4000000,
          explanation: "Small brass top-up",
          proposedBy: "agent:governor",
        },
      },
    });
    expect(under.statusCode).toBe(200);
    expect(
      (under.json() as { evaluation: { finalDecision: string } }).evaluation
        .finalDecision,
    ).toBe("allow");

    const over = await app.inject({
      method: "POST",
      url: "/v1/policies/evaluate",
      headers: orgHeaders({ "content-type": "application/json" }),
      payload: {
        proposedAction: {
          action: "po.create",
          orgId: ORG,
          amountInPaise: 60000000,
          explanation: "Large brass order",
          proposedBy: "agent:governor",
        },
      },
    });
    expect(over.statusCode).toBe(200);
    expect(
      (over.json() as { evaluation: { finalDecision: string } }).evaluation
        .finalDecision,
    ).toBe("require_approval");
  });
});

describe("GET /v1/policies/authority", () => {
  it("returns all known authority actions with seeded effects", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/policies/authority",
      headers: orgHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      actions: Array<{
        action: string;
        currentEffect: string;
        policyKey?: string;
      }>;
    };
    const actions = body.actions.map((a) => a.action);
    expect(actions).toContain("po.create");
    expect(actions).toContain("collect.invoice");
    expect(actions).toContain("pay.vendor");
    expect(actions).toContain("email.send");
    expect(actions).toContain("listing.publish");
    expect(actions).toContain("so.accept");

    const paymentLink = body.actions.find(
      (a) => a.policyKey === "Policy:Payment-Link-Approval",
    );
    expect(paymentLink?.currentEffect).toBe("require_approval");

    const poAuto = body.actions.find(
      (a) => a.policyKey === "Policy:PO-Auto-Under-50k",
    );
    expect(poAuto?.currentEffect).toBe("allow");

    const soAccept = body.actions.find(
      (a) => a.policyKey === "Policy:so.accept",
    );
    expect(soAccept?.currentEffect).toBe("allow");
  });
});

describe("PUT /v1/policies/:key/authority", () => {
  it("updates a policy effect", async () => {
    const key = encodeURIComponent("Policy:Payment-Link-Approval");
    const res = await app.inject({
      method: "PUT",
      url: `/v1/policies/${key}/authority`,
      headers: orgHeaders({ "content-type": "application/json" }),
      payload: { effect: "allow" },
    });
    expect(res.statusCode).toBe(200);

    const overview = await app.inject({
      method: "GET",
      url: "/v1/policies/authority",
      headers: orgHeaders(),
    });
    const body = overview.json() as {
      actions: Array<{ policyKey?: string; currentEffect: string }>;
    };
    const row = body.actions.find(
      (a) => a.policyKey === "Policy:Payment-Link-Approval",
    );
    expect(row?.currentEffect).toBe("allow");
  });
});

describe("POST /v1/policies/:key/toggle", () => {
  it("disables a policy", async () => {
    const key = encodeURIComponent("Policy:pay.vendor");
    const res = await app.inject({
      method: "POST",
      url: `/v1/policies/${key}/toggle`,
      headers: orgHeaders({ "content-type": "application/json" }),
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { node: { props: { enabled: boolean } } };
    expect(body.node.props.enabled).toBe(false);

    const list = await app.inject({
      method: "GET",
      url: "/v1/policies",
      headers: orgHeaders(),
    });
    const policies = (
      list.json() as {
        policies: { node: { key: string }; enabled: boolean }[];
      }
    ).policies;
    const payVendor = policies.find(
      (p) => p.node.key === "Policy:pay.vendor",
    );
    expect(payVendor).toBeDefined();
    expect(payVendor?.enabled).toBe(false);
  });
});
