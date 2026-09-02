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
  db = client.db("karya_calendar_test");
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

describe("calendar routes", () => {
  it("lists seeded meetings", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/calendar/meetings",
      headers: { "x-org-id": ORG },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { meetings: { key: string }[] };
    expect(body.meetings.some((m) => m.key === "Meeting:VendorCall-Thu")).toBe(
      true,
    );
  });

  it("returns brief with PO-104, SO-218, and proposed ask", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/calendar/brief?meetingKey=Meeting:VendorCall-Thu",
      headers: { "x-org-id": ORG },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      brief: {
        proposedAsk: string;
        sections: { heading: string; body: string }[];
      };
    };
    const text = [
      ...body.brief.sections.map((s) => s.body),
      body.brief.proposedAsk,
    ].join(" ");
    expect(text).toContain("PO-104");
    expect(text).toContain("SO-218");
    expect(body.brief.proposedAsk.toLowerCase()).toContain("40kg");
  });

  it("creates follow-up task about meeting", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/calendar/follow-up",
      headers: {
        "x-org-id": ORG,
        "content-type": "application/json",
      },
      payload: { meetingKey: "Meeting:VendorCall-Thu", note: "Confirm air freight" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { task: { key: string; type: string } };
    expect(body.task.key.startsWith("Task:FollowUp-")).toBe(true);
    const task = await store.getNodeByKey(ORG, body.task.key);
    expect(task?.type).toBe("Task");
  });
});
