import { describe, expect, it } from "vitest";
import type { EdgeRecord, NodeRecord } from "@karya/graph";
import { promiseQuery } from "./promise.js";

const ORG = "org_arka";

function node(
  id: string,
  key: string,
  type: NodeRecord["type"],
  label: string,
  props: NodeRecord["props"] = {},
): NodeRecord {
  const now = new Date();
  return {
    _id: id,
    orgId: ORG,
    type,
    key,
    label,
    props,
    createdAt: now,
    updatedAt: now,
  };
}

function edge(
  id: string,
  type: EdgeRecord["type"],
  fromId: string,
  toId: string,
  props: EdgeRecord["props"] = {},
): EdgeRecord {
  return {
    _id: id,
    orgId: ORG,
    type,
    fromId,
    toId,
    props,
    validFrom: new Date(),
    validTo: null,
    createdAt: new Date(),
  };
}

/** Seeded-shaped Diya-Large subgraph: 12 on hand, 9 reserved, PO-104 late + IN-77 delayed. */
function diyaGraph() {
  const brass = node("n_brass", "Material:BrassSheet-22g", "Material", "Brass sheet 22g", {
    uom: "kg",
  });
  const diya = node("n_diya", "SKU:Diya-Large", "SKU", "Diya-Large", {
    priceInPaise: 185000,
  });
  const stock = node("n_stock", "Stock:Diya-Large@Workshop", "Stock", "Diya-Large @ Workshop", {
    on_hand: 12,
    reserved: 9,
  });
  const po104 = node("n_po", "PurchaseOrder:PO-104", "PurchaseOrder", "PO-104", {
    status: "late",
    qty: 40,
  });
  const in77 = node("n_ship", "Shipment:IN-77", "Shipment", "IN-77", {
    status: "delayed",
    delay_days: 4,
  });

  const nodes = [brass, diya, stock, po104, in77];
  const edges = [
    edge("e1", "STOCK_OF", stock._id, diya._id),
    edge("e2", "MADE_FROM", diya._id, brass._id, { qty: 0.35, uom: "kg" }),
    edge("e3", "ORDER_CONTAINS", po104._id, brass._id, { qty: 40, uom: "kg" }),
    edge("e4", "FULFILLS", in77._id, po104._id),
  ];

  return {
    nodes,
    edges,
    getNodeByKey: async (key: string) => nodes.find((n) => n.key === key) ?? null,
    loadGraph: async () => ({ nodes, edges }),
  };
}

describe("promiseQuery", () => {
  it("promise yes when qty fits available only", async () => {
    const g = diyaGraph();
    const result = await promiseQuery(
      { orgId: ORG, skuKey: "SKU:Diya-Large", qty: 3 },
      g.loadGraph,
      g.getNodeByKey,
    );
    expect(result.verdict).toBe("yes");
    expect(result.available).toBe(3);
    expect(result.shortfall).toBe(0);
  });

  it("promise yes_if for 8× Diya-Large on seeded-shaped graph", async () => {
    const g = diyaGraph();
    const result = await promiseQuery(
      { orgId: ORG, skuKey: "SKU:Diya-Large", qty: 8 },
      g.loadGraph,
      g.getNodeByKey,
    );
    expect(result.verdict).toBe("yes_if");
    expect(result.available).toBe(3);
    expect(result.inbound).toBeGreaterThan(0);
    expect(result.blockers.some((b) => b.nodeKey === "PurchaseOrder:PO-104")).toBe(
      true,
    );
  });

  it("promise no when shortfall exceeds inbound", async () => {
    const g = diyaGraph();
    const result = await promiseQuery(
      { orgId: ORG, skuKey: "SKU:Diya-Large", qty: 200 },
      g.loadGraph,
      g.getNodeByKey,
    );
    expect(result.verdict).toBe("no");
    expect(result.shortfall).toBeGreaterThan(0);
  });

  it("names PO-104 blocker when brass inbound delayed", async () => {
    const g = diyaGraph();
    const result = await promiseQuery(
      { orgId: ORG, skuKey: "SKU:Diya-Large", qty: 8 },
      g.loadGraph,
      g.getNodeByKey,
    );
    const po = result.blockers.find((b) => b.kind === "purchase_order");
    expect(po?.label).toBe("PO-104");
    expect(result.summary).toMatch(/PO-104/);
  });
});
