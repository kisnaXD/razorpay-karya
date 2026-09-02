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
import {
  appendEntry,
  getOrCreateThread,
  setPending,
} from "../services/agent-thread.js";
import { createApproval, resolveApproval } from "../services/approvals.js";

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
  db = client.db("karya_agent_test");
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

describe("GET /v1/agent/thread", () => {
  it("creates empty thread when missing", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/agent/thread",
      headers: { "x-org-id": ORG },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      thread: { orgId: string; entries: unknown[]; pending: null };
    };
    expect(body.thread.orgId).toBe(ORG);
    expect(body.thread.entries).toEqual([]);
    expect(body.thread.pending).toBeNull();
  });
});

describe("GET /v1/agent/personas", () => {
  it("returns governor and consultable specialists", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/agent/personas",
      headers: { "x-org-id": ORG },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      personas: Array<{ id: string; canConsult: boolean }>;
    };
    expect(body.personas.map((p) => p.id)).toEqual([
      "governor",
      "finance",
      "procurement",
      "sales",
      "operations",
    ]);
    expect(body.personas[0]?.canConsult).toBe(false);
    expect(body.personas.slice(1).every((p) => p.canConsult)).toBe(true);
  });
});

describe("POST /v1/agent/message", () => {
  it("returns 503 when OPENAI_API_KEY missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/agent/message",
      headers: { "x-org-id": ORG, "content-type": "application/json" },
      payload: { message: "Can we take 8 Diya-Large?" },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: "llm_not_configured" });
  });
});

describe("POST /v1/agent/resume", () => {
  it("resumes after approval rejection with templated message", async () => {
    const created = await createApproval(db, store, ORG, {
      action: "collect.invoice",
      orgId: ORG,
      targetNodeKey: "Invoice:INV-90",
      amountInPaise: 1480000,
      explanation: "Collect overdue INV-90 for Lotus",
      proposedBy: "agent:governor",
    });

    // Force require_approval path: if auto-allowed, skip
    if ("autoAllowed" in created) {
      // Seed policy allows collect.invoice — create synthetic pending
      await getOrCreateThread(db, ORG);
      await appendEntry(db, ORG, {
        id: "entry_tool_1",
        kind: "tool",
        toolName: "money_create_payment_link",
        sideEffectClass: "money",
        status: "awaiting_approval",
        explanation: "Collect overdue INV-90 for Lotus",
        input: {
          invoiceKey: "Invoice:INV-90",
          explanation: "Collect overdue INV-90 for Lotus",
        },
        output: { status: "awaiting_approval", approvalId: "appr_synth" },
        error: null,
        approvalId: "appr_synth",
        createdAt: new Date().toISOString(),
        completedAt: null,
      });
      await setPending(db, ORG, {
        approvalId: "appr_synth",
        toolEntryId: "entry_tool_1",
        resumePayload: {
          invoiceKey: "Invoice:INV-90",
          explanation: "Collect overdue INV-90 for Lotus",
        },
      });

      // Insert fake approval doc
      await db.collection("approvals").insertOne({
        _id: "appr_synth" as never,
        orgId: ORG,
        status: "rejected",
        proposedAction: {
          action: "collect.invoice",
          orgId: ORG,
          targetNodeKey: "Invoice:INV-90",
          explanation: "Collect overdue INV-90 for Lotus",
          proposedBy: "agent:governor",
        },
        evaluation: { finalDecision: "require_approval", results: [] },
        why: "test",
        createdAt: new Date(),
        updatedAt: new Date(),
        resolvedAt: new Date(),
        resolvedBy: "human:anika@arka.atelier",
        resolutionNote: null,
      } as never);

      const res = await app.inject({
        method: "POST",
        url: "/v1/agent/resume",
        headers: { "x-org-id": ORG, "content-type": "application/json" },
        payload: { approvalId: "appr_synth" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { assistantMessage: string; thread: { pending: null } };
      expect(body.assistantMessage).toMatch(/rejected/);
      expect(body.thread.pending).toBeNull();
      return;
    }

    const approvalId = created.approval._id;
    await getOrCreateThread(db, ORG);
    await appendEntry(db, ORG, {
      id: "entry_tool_1",
      kind: "tool",
      toolName: "money_create_payment_link",
      sideEffectClass: "money",
      status: "awaiting_approval",
      explanation: "Collect overdue INV-90 for Lotus",
      input: {
        invoiceKey: "Invoice:INV-90",
        explanation: "Collect overdue INV-90 for Lotus",
      },
      output: { status: "awaiting_approval", approvalId },
      error: null,
      approvalId,
      createdAt: new Date().toISOString(),
      completedAt: null,
    });
    await setPending(db, ORG, {
      approvalId,
      toolEntryId: "entry_tool_1",
      resumePayload: {
        invoiceKey: "Invoice:INV-90",
        explanation: "Collect overdue INV-90 for Lotus",
      },
    });

    await resolveApproval(db, store, ORG, approvalId, {
      status: "rejected",
      resolvedBy: "human:anika@arka.atelier",
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/agent/resume",
      headers: { "x-org-id": ORG, "content-type": "application/json" },
      payload: { approvalId },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { assistantMessage: string };
    expect(body.assistantMessage).toMatch(/rejected/);
  });
});
