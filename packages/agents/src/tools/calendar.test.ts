import { describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { GraphStore } from "@karya/graph";
import { seedArkaAtelier } from "@karya/seed";
import type { ToolContext } from "../types.js";
import { calendarMeetingBrief } from "./calendar.js";

const ORG = "org_arka";

let mongo: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let store: GraphStore;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  client = new MongoClient(mongo.getUri());
  await client.connect();
  db = client.db("karya_calendar_tool_test");
});

afterAll(async () => {
  await client.close();
  await mongo.stop();
});

beforeEach(async () => {
  await db.dropDatabase();
  store = new GraphStore(db);
  await store.ensureIndexes();
  await seedArkaAtelier(store, db);
});

function mockCtx(): ToolContext {
  return {
    orgId: ORG,
    store,
    evaluateAction: async () => ({
      finalDecision: "require_approval",
      results: [],
    }),
    createApproval: async () => ({
      approval: { _id: "appr_test" },
    }),
    createPaymentLink: async () => {
      throw new Error("unused");
    },
    writeAudit: async () => null,
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
}

describe("calendar_meeting_brief tool", () => {
  it("returns sections for VendorCall-Thu", async () => {
    const brief = await calendarMeetingBrief(mockCtx(), {
      meetingKey: "Meeting:VendorCall-Thu",
      explanation: "Prep brief for Thursday vendor call",
    });
    expect(brief.sections.length).toBeGreaterThanOrEqual(3);
    expect(brief.sections.map((s) => s.body).join(" ")).toContain("PO-104");
  });
});
