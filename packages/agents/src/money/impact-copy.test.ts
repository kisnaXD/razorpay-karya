import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GraphStore, newEdgeId, newNodeId } from "@karya/graph";
import {
  buildFailureImpactCopy,
  loadFailureImpact,
} from "./impact-copy.js";

const ORG = "org_arka";

let mongo: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let store: GraphStore;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  client = new MongoClient(mongo.getUri());
  await client.connect();
  db = client.db("karya_agents_impact_test");
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

async function seedBeatingHeart() {
  const payment = await store.upsertNode({
    _id: newNodeId(),
    orgId: ORG,
    type: "Payment",
    key: "Payment:plink_7",
    label: "plink_7",
    props: {
      status: "expired",
      channel: "payment_link",
      amountInPaise: 1480000,
    },
  });
  const invoice = await store.upsertNode({
    _id: newNodeId(),
    orgId: ORG,
    type: "Invoice",
    key: "Invoice:INV-90",
    label: "INV-90",
    props: { status: "overdue", amountInPaise: 1480000 },
  });
  const so = await store.upsertNode({
    _id: newNodeId(),
    orgId: ORG,
    type: "SalesOrder",
    key: "SalesOrder:SO-218",
    label: "SO-218",
    props: { status: "promised", promise_date: "Friday", qty: 8 },
  });
  const buyer = await store.upsertNode({
    _id: newNodeId(),
    orgId: ORG,
    type: "Org",
    key: "Org:Lotus-Boutique",
    label: "Lotus Boutique",
    props: { role: "customer" },
  });
  const sku = await store.upsertNode({
    _id: newNodeId(),
    orgId: ORG,
    type: "SKU",
    key: "SKU:Diya-Large",
    label: "Diya-Large",
    props: {},
  });
  const stock = await store.upsertNode({
    _id: newNodeId(),
    orgId: ORG,
    type: "Stock",
    key: "Stock:Diya-Large@Workshop",
    label: "Diya-Large @ Workshop",
    props: { on_hand: 12, reserved: 9 },
  });
  const listing = await store.upsertNode({
    _id: newNodeId(),
    orgId: ORG,
    type: "Listing",
    key: "Listing:Diya-Large-Instagram",
    label: "Diya-Large Instagram",
    props: {},
  });
  const lead = await store.upsertNode({
    _id: newNodeId(),
    orgId: ORG,
    type: "Lead",
    key: "Lead:IG-Ananya",
    label: "IG-Ananya",
    props: {},
  });

  const write = async (
    type: "PAYS" | "INVOICES" | "BUYS" | "ORDER_CONTAINS" | "STOCK_OF" | "LISTS" | "SOURCED_FROM",
    fromId: string,
    toId: string,
    props: Record<string, string | number | boolean | null> = {},
  ) => {
    await store.writeEdge({
      _id: newEdgeId(),
      orgId: ORG,
      type,
      fromId,
      toId,
      props,
      validFrom: new Date(),
    });
  };

  await write("PAYS", payment._id, invoice._id);
  await write("INVOICES", invoice._id, so._id);
  await write("BUYS", buyer._id, so._id);
  await write("ORDER_CONTAINS", so._id, sku._id, { qty: 8 });
  await write("STOCK_OF", stock._id, sku._id);
  await write("LISTS", listing._id, sku._id);
  await write("SOURCED_FROM", lead._id, listing._id);

  return payment;
}

describe("buildFailureImpactCopy", () => {
  it("matches locked demo copy shape", async () => {
    const payment = await seedBeatingHeart();
    const impact = await loadFailureImpact(store, ORG, payment._id);
    const copy = buildFailureImpactCopy(impact);
    expect(copy).toContain("Lotus Boutique");
    expect(copy).toContain("INV-90");
    expect(copy).toContain("₹14,800");
    expect(copy).toContain("SO-218");
    expect(copy).toContain("Diya-Large");
    expect(copy).toContain("Friday");
    expect(copy).toContain("9 units");
    expect(copy).toContain("IG-Ananya");
  });
});
