import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GraphStore } from "@karya/graph";
import { seedArkaAtelier } from "@karya/seed";
import { buildDraftPreview, explainMaterialNeed } from "./draft-po.js";

const ORG = "org_arka";

let mongo: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let store: GraphStore;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  client = new MongoClient(mongo.getUri());
  await client.connect();
  db = client.db("karya_sourcing_agents_test");
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

describe("explainMaterialNeed", () => {
  it("explainMaterialNeed for SO-218 suggests 40kg and names PO-104", async () => {
    const result = await explainMaterialNeed(store, ORG, {
      materialKey: "Material:BrassSheet-22g",
      triggerSalesOrderKey: "SalesOrder:SO-218",
    });
    expect(result.suggestedQtyKg).toBe(40);
    expect(result.whyParagraph).toMatch(/PO-104/);
    expect(result.whyParagraph).toMatch(/SO-218|40kg/);
    expect(result.blockers.some((b) => b.nodeKey === "PurchaseOrder:PO-104")).toBe(
      true,
    );
  });
});

describe("buildDraftPreview", () => {
  it("buildDraftPreview computes PO-105 key when PO-104 exists", async () => {
    const preview = await buildDraftPreview(store, {
      orgId: ORG,
      vendorOrgKey: "Org:Shree-Metal-Works",
      materialKey: "Material:BrassSheet-22g",
      qtyKg: 40,
      reasonSalesOrderKeys: ["SalesOrder:SO-218"],
      expectedAtDays: 7,
      explanation: "Draft brass PO for SO-218 shortfall",
    });
    expect(preview.poKey).toBe("PurchaseOrder:PO-105");
    expect(preview.vendorLabel).toBe("Shree Metal Works");
    expect(preview.qtyKg).toBe(40);
    expect(preview.estimatedTotalInPaise).toBe(40 * 40500);
    expect(preview.why).toMatch(/SO-218/);
  });

  it("buildDraftPreview skips reserved pending PO keys", async () => {
    const preview = await buildDraftPreview(store, {
      orgId: ORG,
      vendorOrgKey: "Org:Shree-Metal-Works",
      materialKey: "Material:BrassSheet-22g",
      qtyKg: 40,
      explanation: "Second draft while PO-105 is pending",
      reservedPoKeys: ["PurchaseOrder:PO-105"],
    });
    expect(preview.poKey).toBe("PurchaseOrder:PO-106");
  });
});
