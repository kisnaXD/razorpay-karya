import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GraphStore, newEdgeId, newNodeId } from "@karya/graph";
import { buildCatalog } from "./catalog.js";

const ORG = "org_arka";
const DAY_MS = 86400000;

let mongo: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let store: GraphStore;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  client = new MongoClient(mongo.getUri());
  await client.connect();
  db = client.db("karya_a2a_catalog_test");
});

afterAll(async () => {
  await client.close();
  await mongo.stop();
});

beforeEach(async () => {
  await db.dropDatabase();
  store = new GraphStore(db);
  await store.ensureIndexes();

  const merchant = await store.upsertNode({
    _id: newNodeId(),
    orgId: ORG,
    type: "Org",
    key: "Org:Arka-Atelier",
    label: "Arka Atelier",
    props: { role: "merchant", city: "Jaipur" },
  });
  void merchant;

  const diya = await store.upsertNode({
    _id: newNodeId(),
    orgId: ORG,
    type: "SKU",
    key: "SKU:Diya-Large",
    label: "Diya-Large",
    props: {
      priceInPaise: 185000,
      gst: 12,
      lead_days: 5,
      description: "Large hand-hammered brass diya",
      image_urls_json: JSON.stringify([
        "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=400",
      ]),
    },
  });

  const tray = await store.upsertNode({
    _id: newNodeId(),
    orgId: ORG,
    type: "SKU",
    key: "SKU:Tray-Oval",
    label: "Tray-Oval",
    props: { priceInPaise: 240000 },
  });

  const diyaStock = await store.upsertNode({
    _id: newNodeId(),
    orgId: ORG,
    type: "Stock",
    key: "Stock:Diya-Large@Workshop",
    label: "Diya-Large @ Workshop",
    props: { on_hand: 12, reserved: 9 },
  });

  const trayStock = await store.upsertNode({
    _id: newNodeId(),
    orgId: ORG,
    type: "Stock",
    key: "Stock:Tray-Oval@Workshop",
    label: "Tray-Oval @ Workshop",
    props: { on_hand: 20, reserved: 0 },
  });

  await store.writeEdge({
    _id: newEdgeId(),
    orgId: ORG,
    type: "STOCK_OF",
    fromId: diyaStock._id,
    toId: diya._id,
    props: {},
    validFrom: new Date(),
  });
  await store.writeEdge({
    _id: newEdgeId(),
    orgId: ORG,
    type: "STOCK_OF",
    fromId: trayStock._id,
    toId: tray._id,
    props: {},
    validFrom: new Date(),
  });
});

describe("buildCatalog", () => {
  it("catalog lists Diya-Large with availableQty 3 and gst 12", async () => {
    const catalog = await buildCatalog(store, ORG);
    const diya = catalog.items.find((i) => i.skuKey === "SKU:Diya-Large");
    expect(diya).toBeDefined();
    expect(diya!.availableQty).toBe(3);
    expect(diya!.gstRatePercent).toBe(12);
    expect(diya!.priceInPaise).toBe(185000);
    expect(diya!.inStock).toBe(true);
    expect(diya!.images.length).toBe(1);
    expect(catalog.merchant.name).toBe("Arka Atelier");
    expect(catalog.merchant.orgId).toBe(ORG);
  });

  it("catalog marks Tray-Oval inStock true but price above demo budget", async () => {
    const catalog = await buildCatalog(store, ORG);
    const tray = catalog.items.find((i) => i.skuKey === "SKU:Tray-Oval");
    expect(tray).toBeDefined();
    expect(tray!.inStock).toBe(true);
    expect(tray!.availableQty).toBe(20);
    expect(tray!.priceInPaise).toBeGreaterThan(200000);
  });

  it("canShipBy is today + lead_days", async () => {
    const before = Date.now();
    const catalog = await buildCatalog(store, ORG);
    const diya = catalog.items.find((i) => i.skuKey === "SKU:Diya-Large")!;
    expect(diya.leadDays).toBe(5);
    const canShip = new Date(diya.canShipBy).getTime();
    const expectedMin = before + 5 * DAY_MS - 2000;
    const expectedMax = Date.now() + 5 * DAY_MS + 2000;
    expect(canShip).toBeGreaterThanOrEqual(expectedMin);
    expect(canShip).toBeLessThanOrEqual(expectedMax);
  });
});
