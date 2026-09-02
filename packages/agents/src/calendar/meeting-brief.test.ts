import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GraphStore } from "@karya/graph";
import { seedArkaAtelier } from "@karya/seed";
import { buildMeetingBrief } from "./meeting-brief.js";

const ORG = "org_arka";

let mongo: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let store: GraphStore;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  client = new MongoClient(mongo.getUri());
  await client.connect();
  db = client.db("karya_meeting_brief_test");
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

describe("buildMeetingBrief", () => {
  it("brief for VendorCall-Thu mentions PO-104, SO-218, and proposed ask", async () => {
    const brief = await buildMeetingBrief(
      store,
      ORG,
      "Meeting:VendorCall-Thu",
    );
    expect(brief.meetingKey).toBe("Meeting:VendorCall-Thu");
    const text = [
      ...brief.sections.map((s) => `${s.heading}: ${s.body}`),
      brief.proposedAsk,
    ].join("\n");
    expect(text).toContain("PO-104");
    expect(text).toContain("SO-218");
    expect(brief.proposedAsk.toLowerCase()).toContain("40kg");
    expect(brief.sections.some((s) => s.heading === "Context")).toBe(true);
    expect(brief.sections.some((s) => s.heading === "Demand")).toBe(true);
  });
});
