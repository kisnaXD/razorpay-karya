import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GraphStore } from "./store.js";
import { newEdgeId, newNodeId } from "./ids.js";
import type { NodeRecord, EdgeRecord } from "./types.js";

const ORG = "org_arka";

let mongo: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let store: GraphStore;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  client = new MongoClient(mongo.getUri());
  await client.connect();
  db = client.db("karya_test");
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

function node(
  key: string,
  type: NodeRecord["type"],
  label: string,
  props: NodeRecord["props"] = {},
): Omit<NodeRecord, "createdAt" | "updatedAt"> {
  return {
    _id: newNodeId(),
    orgId: ORG,
    type,
    key,
    label,
    props,
  };
}

async function seedBeatingHeart() {
  const meenakshi = await store.upsertNode(
    node("Org:Meenakshi-Brass", "Org", "Meenakshi Brass", {
      role: "vendor",
      city: "Moradabad",
    }),
  );
  const brass = await store.upsertNode(
    node("Material:BrassSheet-22g", "Material", "Brass sheet 22g", { uom: "kg" }),
  );
  const po104 = await store.upsertNode(
    node("PurchaseOrder:PO-104", "PurchaseOrder", "PO-104", {
      status: "late",
      expectedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      qty: 40,
    }),
  );
  const in77 = await store.upsertNode(
    node("Shipment:IN-77", "Shipment", "IN-77", {
      direction: "inbound",
      status: "delayed",
      delay_days: 4,
    }),
  );
  const diya = await store.upsertNode(
    node("SKU:Diya-Large", "SKU", "Diya Large", { priceInPaise: 185000 }),
  );
  const stock = await store.upsertNode(
    node("Stock:Diya-Large@Workshop", "Stock", "Diya-Large @ Workshop", {
      on_hand: 12,
      reserved: 9,
      incoming: 40,
    }),
  );
  const so218 = await store.upsertNode(
    node("SalesOrder:SO-218", "SalesOrder", "SO-218", {
      status: "promised",
      promise_date: "Friday",
      qty: 8,
    }),
  );
  const lotus = await store.upsertNode(
    node("Org:Lotus-Boutique", "Org", "Lotus Boutique", {
      role: "customer",
      city: "Mumbai",
    }),
  );
  const inv90 = await store.upsertNode(
    node("Invoice:INV-90", "Invoice", "INV-90", {
      status: "overdue",
      amountInPaise: 1480000,
      dueAt: new Date(Date.now() - 11 * 86400000).toISOString(),
    }),
  );

  const write = (
    type: Parameters<GraphStore["writeEdge"]>[0]["type"],
    fromId: string,
    toId: string,
    props: Record<string, string | number | boolean | null> = {},
  ) =>
    store.writeEdge({
      _id: newEdgeId(),
      orgId: ORG,
      type,
      fromId,
      toId,
      props,
      validFrom: new Date(),
    });

  await write("SUPPLIES", meenakshi._id, brass._id);
  await write("ORDER_CONTAINS", po104._id, brass._id, { qty: 40, uom: "kg" });
  await write("FULFILLS", in77._id, po104._id);
  await write("MADE_FROM", diya._id, brass._id, { qty: 0.35, uom: "kg" });
  await write("STOCK_OF", stock._id, diya._id);
  await write("ORDER_CONTAINS", so218._id, diya._id, { qty: 8 });
  await write("BUYS", lotus._id, so218._id);
  await write("INVOICES", inv90._id, so218._id);
  await write("ABOUT", so218._id, po104._id);
  await write("CONTACT_AT", meenakshi._id, po104._id);

  return { meenakshi, brass, po104, in77, diya, stock, so218, lotus, inv90 };
}

describe("GraphStore", () => {
  it("upserts a node by key without duplicating", async () => {
    const id = newNodeId();
    const first = await store.upsertNode({
      _id: id,
      orgId: ORG,
      type: "SKU",
      key: "SKU:Test",
      label: "Test SKU v1",
      props: { priceInPaise: 100 },
    });
    const second = await store.upsertNode({
      _id: newNodeId(),
      orgId: ORG,
      type: "SKU",
      key: "SKU:Test",
      label: "Test SKU v2",
      props: { priceInPaise: 200 },
    });

    expect(second._id).toBe(first._id);
    expect(second.label).toBe("Test SKU v2");
    expect(second.props.priceInPaise).toBe(200);

    const all = await store.listNodes(ORG, "SKU");
    expect(all).toHaveLength(1);
  });

  it("writeEdge supersedes the previous current edge", async () => {
    const sku = await store.upsertNode(
      node("SKU:Brass-Bowl", "SKU", "Brass Bowl"),
    );
    const stock = await store.upsertNode(
      node("Stock:Brass-Bowl@Shop", "Stock", "Brass Bowl stock"),
    );

    const first = await store.writeEdge({
      _id: newEdgeId(),
      orgId: ORG,
      type: "STOCK_OF",
      fromId: stock._id,
      toId: sku._id,
      props: { qty: 5 },
      validFrom: new Date("2026-01-01"),
    });

    const second = await store.writeEdge({
      _id: newEdgeId(),
      orgId: ORG,
      type: "STOCK_OF",
      fromId: stock._id,
      toId: sku._id,
      props: { qty: 12 },
      validFrom: new Date("2026-02-01"),
    });

    const edges = await db
      .collection<EdgeRecord>("edges")
      .find({ orgId: ORG })
      .toArray();
    const current = edges.filter((e) => e.validTo === null);
    expect(current).toHaveLength(1);
    expect(current[0]?._id).toBe(second._id);

    const superseded = edges.find((e) => e._id === first._id);
    expect(superseded?.validTo).not.toBeNull();

    const supersedes = edges.find(
      (e) => e.type === "SUPERSEDES" && e.fromId === second._id && e.toId === first._id,
    );
    expect(supersedes).toBeDefined();
  });

  it("neighborhood depth 2 from SO-218 reaches Meenakshi Brass after seed-shaped writes", async () => {
    const { so218, meenakshi } = await seedBeatingHeart();
    const n = await store.neighborhood(ORG, so218._id, 2);
    const keys = n.nodes.map((x) => x.key);
    expect(keys).toContain("Org:Meenakshi-Brass");
    expect(n.center.key).toBe("SalesOrder:SO-218");
    expect(n.center._id).toBe(so218._id);
    expect(meenakshi._id).toBeDefined();
  });

  it("path(SO-218, Meenakshi Brass) is non-null", async () => {
    const { so218, meenakshi } = await seedBeatingHeart();
    const p = await store.path(ORG, so218._id, meenakshi._id);
    expect(p).not.toBeNull();
    expect(p!.nodes.length).toBeGreaterThanOrEqual(2);
    expect(p!.edges.length).toBeGreaterThanOrEqual(1);
  });

  it("impact(PO-104) includes SO-218 and Diya-Large stock", async () => {
    const { po104, so218, stock } = await seedBeatingHeart();
    const result = await store.impact(ORG, po104._id);
    const ids = result.nodes.map((n) => n._id);
    expect(ids).toContain(so218._id);
    expect(ids).toContain(stock._id);
  });

  it("exceptions() returns overdue invoice and delayed shipment", async () => {
    await seedBeatingHeart();
    const ex = await store.exceptions(ORG);
    const codes = ex.map((e) => e.code);
    expect(codes).toContain("invoice.overdue");
    expect(codes).toContain("shipment.delayed");
  });

  it("exceptions() returns po.late for a late purchase order", async () => {
    await store.upsertNode(
      node("PurchaseOrder:PO-late", "PurchaseOrder", "PO-late", {
        status: "late",
        expectedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      }),
    );
    const ex = await store.exceptions(ORG);
    expect(ex.some((e) => e.code === "po.late")).toBe(true);
  });

  it("exceptions() returns payment.uncollected for sent payments", async () => {
    await store.upsertNode(
      node("Payment:plink-test", "Payment", "plink-test", {
        status: "sent",
        channel: "payment_link",
      }),
    );
    const ex = await store.exceptions(ORG);
    expect(ex.some((e) => e.code === "payment.uncollected")).toBe(true);
  });

  it("exceptions() returns stock.promise_risk when promised qty exceeds availability", async () => {
    const skuA = await store.upsertNode(node("SKU:Risk-A", "SKU", "Risk A"));
    const skuB = await store.upsertNode(node("SKU:Risk-B", "SKU", "Risk B"));
    const stockA = await store.upsertNode(
      node("Stock:Risk-A@Shop", "Stock", "Risk A stock", {
        on_hand: 5,
        reserved: 2,
      }),
    );
    const so = await store.upsertNode(
      node("SalesOrder:SO-risk", "SalesOrder", "SO-risk", { status: "promised" }),
    );

    const write = (
      type: Parameters<GraphStore["writeEdge"]>[0]["type"],
      fromId: string,
      toId: string,
      props: Record<string, string | number | boolean | null> = {},
    ) =>
      store.writeEdge({
        _id: newEdgeId(),
        orgId: ORG,
        type,
        fromId,
        toId,
        props,
        validFrom: new Date(),
      });

    await write("STOCK_OF", stockA._id, skuA._id);
    await write("ORDER_CONTAINS", so._id, skuA._id, { qty: 8 });
    await write("ORDER_CONTAINS", so._id, skuB._id, { qty: 4 });

    const ex = await store.exceptions(ORG);
    const risks = ex.filter((e) => e.code === "stock.promise_risk");
    expect(risks).toHaveLength(2);
    expect(new Set(risks.map((e) => e.id)).size).toBe(2);
    expect(risks.every((e) => e.nodeId === so._id)).toBe(true);
  });

  it("exceptions() counts inbound PO qty once with multiple fulfillments", async () => {
    const material = await store.upsertNode(
      node("Material:Brass-Test", "Material", "Brass test"),
    );
    const sku = await store.upsertNode(node("SKU:Covered-SKU", "SKU", "Covered SKU"));
    const stock = await store.upsertNode(
      node("Stock:Covered@Shop", "Stock", "Covered stock", {
        on_hand: 2,
        reserved: 0,
      }),
    );
    const po = await store.upsertNode(
      node("PurchaseOrder:PO-inbound", "PurchaseOrder", "PO-inbound", {
        status: "open",
      }),
    );
    const shipA = await store.upsertNode(
      node("Shipment:IN-A", "Shipment", "IN-A", { status: "in_transit" }),
    );
    const shipB = await store.upsertNode(
      node("Shipment:IN-B", "Shipment", "IN-B", { status: "in_transit" }),
    );
    const so = await store.upsertNode(
      node("SalesOrder:SO-covered", "SalesOrder", "SO-covered", {
        status: "promised",
      }),
    );

    const write = (
      type: Parameters<GraphStore["writeEdge"]>[0]["type"],
      fromId: string,
      toId: string,
      props: Record<string, string | number | boolean | null> = {},
    ) =>
      store.writeEdge({
        _id: newEdgeId(),
        orgId: ORG,
        type,
        fromId,
        toId,
        props,
        validFrom: new Date(),
      });

    await write("MADE_FROM", sku._id, material._id);
    await write("STOCK_OF", stock._id, sku._id);
    await write("ORDER_CONTAINS", po._id, material._id, { qty: 10 });
    await write("FULFILLS", shipA._id, po._id);
    await write("FULFILLS", shipB._id, po._id);
    await write("ORDER_CONTAINS", so._id, sku._id, { qty: 5 });

    const ex = await store.exceptions(ORG);
    const risk = ex.find((e) => e.code === "stock.promise_risk");
    expect(risk).toBeUndefined();
  });

  it("TimeSlice before supersede returns the old qty", async () => {
    const sku = await store.upsertNode(node("SKU:Time-Slice", "SKU", "Time Slice"));
    const stock = await store.upsertNode(
      node("Stock:Time-Slice@Shop", "Stock", "Time Slice stock"),
    );

    const t1 = new Date("2026-03-01T10:00:00Z");
    const t2 = new Date("2026-04-01T10:00:00Z");
    const sliceAt = new Date("2026-03-15T10:00:00Z");

    await store.writeEdge({
      _id: newEdgeId(),
      orgId: ORG,
      type: "STOCK_OF",
      fromId: stock._id,
      toId: sku._id,
      props: { qty: 10 },
      validFrom: t1,
    });

    await store.writeEdge({
      _id: newEdgeId(),
      orgId: ORG,
      type: "STOCK_OF",
      fromId: stock._id,
      toId: sku._id,
      props: { qty: 20 },
      validFrom: t2,
    });

    const n = await store.neighborhood(ORG, stock._id, 1, { at: sliceAt });
    const stockEdge = n.edges.find((e) => e.type === "STOCK_OF");
    expect(stockEdge?.props.qty).toBe(10);
  });
});
