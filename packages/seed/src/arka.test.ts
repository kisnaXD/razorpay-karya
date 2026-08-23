import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GraphStore } from "@karya/graph";
import { seedArkaAtelier } from "./arka.js";

const ORG = "org_arka";

let mongo: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let store: GraphStore;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  client = new MongoClient(mongo.getUri());
  await client.connect();
  db = client.db("karya_seed_test");
});

afterAll(async () => {
  await client.close();
  await mongo.stop();
});

beforeEach(async () => {
  await db.dropDatabase();
  store = new GraphStore(db);
  await store.ensureIndexes();
});

describe("seedArkaAtelier", () => {
  it("creates the beating-heart path from SO-218 to Meenakshi Brass", async () => {
    await seedArkaAtelier(store);
    const so = await store.getNodeByKey(ORG, "SalesOrder:SO-218");
    const vendor = await store.getNodeByKey(ORG, "Org:Meenakshi-Brass");
    const p = await store.path(ORG, so!._id, vendor!._id);
    expect(p).not.toBeNull();
  });

  it("exceptions include INV-90, IN-77, PO-104, plink_7, and SO-218 promise risk", async () => {
    await seedArkaAtelier(store);
    const ex = await store.exceptions(ORG);
    const codes = ex.map((e) => e.code).sort();
    expect(codes).toEqual(
      expect.arrayContaining([
        "invoice.overdue",
        "shipment.delayed",
        "po.late",
        "payment.uncollected",
        "stock.promise_risk",
      ]),
    );
  });

  it("is idempotent", async () => {
    const a = await seedArkaAtelier(store);
    const b = await seedArkaAtelier(store);
    expect(b.nodes).toBe(a.nodes);
  });
});
