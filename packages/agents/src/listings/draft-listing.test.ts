import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GraphStore } from "@karya/graph";
import { seedArkaAtelier } from "@karya/seed";
import { draftListingForSku } from "./draft-listing.js";

const ORG = "org_arka";

let mongo: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let store: GraphStore;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  client = new MongoClient(mongo.getUri());
  await client.connect();
  db = client.db("karya_listing_draft_test");
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

describe("draftListingForSku", () => {
  it("mentions brass and Diya-Large", async () => {
    const draft = await draftListingForSku(store, ORG, "SKU:Diya-Large");
    const text = [draft.title, ...draft.bullets, ...draft.hashtags].join(" ");
    expect(text.toLowerCase()).toContain("brass");
    expect(text).toContain("Diya-Large");
    expect(draft.bullets.length).toBeGreaterThanOrEqual(3);
  });
});
