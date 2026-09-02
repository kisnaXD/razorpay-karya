import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GraphStore } from "@karya/graph";
import { seedArkaAtelier } from "@karya/seed";
import { draftVendorChaseEmail } from "./draft-email.js";

const ORG = "org_arka";

let mongo: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let store: GraphStore;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  client = new MongoClient(mongo.getUri());
  await client.connect();
  db = client.db("karya_email_draft_test");
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

describe("draftVendorChaseEmail", () => {
  it("references late shipment and PO-104", async () => {
    const draft = await draftVendorChaseEmail(store, ORG, {
      aboutNodeKey: "PurchaseOrder:PO-104",
      recipientOrgKey: "Org:Meenakshi-Brass",
      tone: "firm",
    });
    expect(draft.subject).toContain("PO-104");
    expect(draft.bodyText.toLowerCase()).toMatch(/late|delay/);
    expect(draft.bodyText).toContain("40kg");
  });
});
