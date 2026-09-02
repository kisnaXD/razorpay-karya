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
import { resolveApproval } from "../services/approvals.js";

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
  db = client.db("karya_comms_test");
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

describe("comms routes", () => {
  it("draft creates Message node + ABOUT edge", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/comms/draft-email",
      headers: {
        "x-org-id": ORG,
        "content-type": "application/json",
      },
      payload: {
        aboutNodeKey: "PurchaseOrder:PO-104",
        recipientOrgKey: "Org:Meenakshi-Brass",
        tone: "firm",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      messageKey: string;
      subject: string;
      bodyText: string;
    };
    expect(body.messageKey.startsWith("Message:Draft-")).toBe(true);
    expect(body.subject).toContain("PO-104");
    expect(body.bodyText.toLowerCase()).toMatch(/late|delay/);

    const message = await store.getNodeByKey(ORG, body.messageKey);
    expect(message?.props.status).toBe("draft");
    const po = await store.getNodeByKey(ORG, "PurchaseOrder:PO-104");
    const hood = await store.neighborhood(ORG, message!._id, 1);
    const about = hood.edges.find(
      (e) =>
        e.type === "ABOUT" &&
        e.fromId === message!._id &&
        e.toId === po!._id,
    );
    expect(about).toBeTruthy();
  });

  it("send creates approval; approve marks message sent", async () => {
    const draftRes = await app.inject({
      method: "POST",
      url: "/v1/comms/draft-email",
      headers: {
        "x-org-id": ORG,
        "content-type": "application/json",
      },
      payload: {
        aboutNodeKey: "PurchaseOrder:PO-104",
        recipientOrgKey: "Org:Meenakshi-Brass",
      },
    });
    const draft = draftRes.json() as { messageKey: string };

    const sendRes = await app.inject({
      method: "POST",
      url: "/v1/comms/send",
      headers: {
        "x-org-id": ORG,
        "content-type": "application/json",
      },
      payload: { messageKey: draft.messageKey },
    });
    expect(sendRes.statusCode).toBe(200);
    const body = sendRes.json() as { approval: { _id: string } };
    expect(body.approval._id).toBeTruthy();

    await resolveApproval(db, store, ORG, body.approval._id, {
      status: "approved",
      resolvedBy: "human:anika@arka.atelier",
    });

    const message = await store.getNodeByKey(ORG, draft.messageKey);
    expect(message?.props.status).toBe("sent");
    const events = await store.listNodes(ORG, "Event");
    expect(events.some((e) => e.props.event_type === "message.sent")).toBe(
      true,
    );
  });
});
