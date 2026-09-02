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
import { buildTools, type ToolContext } from "@karya/agents";
import { ensureApprovalIndexes } from "../mongo.js";
import { buildApp } from "../app.js";
import type { Env } from "../env.js";
import type { FastifyInstance } from "fastify";
import { createApproval, listReservedPoKeys } from "../services/approvals.js";
import { evaluateAction } from "../services/policy.js";
import { writeAuditEvent } from "../services/audit.js";

const ORG = "org_arka";

const testEnv: Env = {
  MONGO_URL: "mongodb://unused",
  API_PORT: 4000,
  WEB_ORIGIN: "http://localhost:3000",
  NODE_ENV: "development",
  PAYOUT_PROVIDER: "ledger",
  A2A_ORG_ID: "org_arka",
  OPENAI_MODEL: "gpt-4o-mini",
  BROWSER_ENABLED: false,
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
  db = client.db("karya_sourcing_api_test");
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

describe("GET /v1/sourcing/vendors", () => {
  it("returns directory vendors for brass sheet", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/sourcing/vendors?materialKey=Material:BrassSheet-22g&limit=5",
      headers: orgHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      vendors: Array<{ orgKey: string }>;
      source: string;
    };
    expect(body.source).toBe("directory");
    expect(body.vendors.map((v) => v.orgKey)).toEqual(
      expect.arrayContaining([
        "Org:Meenakshi-Brass",
        "Org:Shree-Metal-Works",
      ]),
    );
  });
});

describe("GET /v1/sourcing/need", () => {
  it("explains brass need with 40kg suggestion", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/sourcing/need?materialKey=Material:BrassSheet-22g&soKey=SalesOrder:SO-218",
      headers: orgHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      suggestedQtyKg: number;
      whyParagraph: string;
    };
    expect(body.suggestedQtyKg).toBe(40);
    expect(body.whyParagraph).toMatch(/PO-104/);
  });
});

describe("POST /v1/sourcing/draft-po", () => {
  it("creates pending approval for po.create", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/sourcing/draft-po",
      headers: orgHeaders({ "content-type": "application/json" }),
      payload: {
        vendorOrgKey: "Org:Shree-Metal-Works",
        materialKey: "Material:BrassSheet-22g",
        qtyKg: 40,
        reasonSalesOrderKeys: ["SalesOrder:SO-218"],
        explanation: "Draft PO for brass shortfall on SO-218",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      approvalId: string;
      preview: { poKey: string; qtyKg: number };
    };
    expect(body.approvalId.startsWith("appr_")).toBe(true);
    expect(body.preview.poKey).toBe("PurchaseOrder:PO-105");
    expect(body.preview.qtyKg).toBe(40);
  });
});

describe("POST /v1/sourcing/browse", () => {
  it("returns 503 with directory fallback when browser disabled", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/sourcing/browse",
      headers: orgHeaders({ "content-type": "application/json" }),
      payload: {
        url: "https://www.indiamart.com/search.html",
        purpose: "IndiaMART brass sheet search",
        explanation: "Optional live browse for brass vendors",
      },
    });
    expect(res.statusCode).toBe(503);
    const body = res.json() as {
      error: string;
      fallback: string;
      vendors: unknown[];
    };
    expect(body.error).toBe("browser_disabled");
    expect(body.fallback).toBe("directory");
    expect(body.vendors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("sourcing_draft_po Governor tool", () => {
  it("creates pending approval via tool context", async () => {
    const ctx: ToolContext = {
      orgId: ORG,
      store,
      evaluateAction: (proposed) => evaluateAction(store, ORG, proposed),
      createApproval: (proposed) => createApproval(db, store, ORG, proposed),
      listReservedPoKeys: () => listReservedPoKeys(db, ORG),
      createPaymentLink: async () => {
        throw new Error("unused");
      },
      writeAudit: (input) =>
        writeAuditEvent(store, {
          orgId: ORG,
          actor: "agent:governor",
          eventType: input.eventType,
          sideEffectClass: input.sideEffectClass,
          payload: input.payload,
        }),
      promiseQuery: async () => {
        throw new Error("unused");
      },
      getOrderBook: async () => [],
      generateQuote: async () => {
        throw new Error("unused");
      },
      acceptSalesOrder: async () => {
        throw new Error("unused");
      },
      rejectSalesOrder: async () => {
        throw new Error("unused");
      },
    };

    const tools = buildTools(ctx);
    const draft = tools.sourcing_draft_po;
    expect(draft?.execute).toBeTypeOf("function");
    const output = (await draft!.execute!(
      {
        vendorOrgKey: "Org:Shree-Metal-Works",
        materialKey: "Material:BrassSheet-22g",
        qtyKg: 40,
        reasonSalesOrderKeys: ["SalesOrder:SO-218"],
        explanation: "Governor drafts brass PO for SO-218",
      },
      {} as never,
    )) as {
      status: string;
      approvalId?: string;
      draftPreview: { poKey: string };
    };

    expect(output.status).toBe("awaiting_approval");
    expect(output.approvalId?.startsWith("appr_")).toBe(true);
    expect(output.draftPreview.poKey).toBe("PurchaseOrder:PO-105");
  });
});
