import { describe, expect, it } from "vitest";
import { evaluateExceptions } from "./exceptions.js";
import type { EdgeRecord, NodeRecord } from "./types.js";

function node(
  id: string,
  type: NodeRecord["type"],
  key: string,
  label: string,
  props: NodeRecord["props"] = {},
): NodeRecord {
  const now = new Date();
  return {
    _id: id,
    orgId: "org_arka",
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
    orgId: "org_arka",
    type,
    fromId,
    toId,
    props,
    validFrom: new Date(),
    validTo: null,
    createdAt: new Date(),
  };
}

describe("payment.failure exception", () => {
  it("includes SO-218, INV-90, and lead in detail when subgraph present", () => {
    const payment = node("pay1", "Payment", "Payment:plink_7", "plink_7", {
      status: "expired",
      amountInPaise: 1480000,
      channel: "payment_link",
    });
    const invoice = node("inv1", "Invoice", "Invoice:INV-90", "INV-90", {
      status: "overdue",
      amountInPaise: 1480000,
    });
    const so = node("so1", "SalesOrder", "SalesOrder:SO-218", "SO-218", {
      status: "promised",
      promise_date: "Friday",
    });
    const buyer = node("buy1", "Org", "Org:Lotus-Boutique", "Lotus Boutique", {
      role: "customer",
    });
    const sku = node("sku1", "SKU", "SKU:Diya-Large", "Diya-Large", {});
    const stock = node(
      "stk1",
      "Stock",
      "Stock:Diya-Large@Workshop",
      "Diya-Large @ Workshop",
      { on_hand: 12, reserved: 9 },
    );
    const listing = node(
      "lst1",
      "Listing",
      "Listing:Diya-Large-Instagram",
      "Diya-Large Instagram",
      {},
    );
    const lead = node("lead1", "Lead", "Lead:IG-Ananya", "IG-Ananya", {});

    const nodes = [payment, invoice, so, buyer, sku, stock, listing, lead];
    const edges = [
      edge("e1", "PAYS", payment._id, invoice._id),
      edge("e2", "INVOICES", invoice._id, so._id),
      edge("e3", "BUYS", buyer._id, so._id),
      edge("e4", "ORDER_CONTAINS", so._id, sku._id, { qty: 8 }),
      edge("e5", "STOCK_OF", stock._id, sku._id),
      edge("e6", "LISTS", listing._id, sku._id),
      edge("e7", "SOURCED_FROM", lead._id, listing._id),
    ];

    const ex = evaluateExceptions(nodes, edges);
    const failure = ex.find((e) => e.code === "payment.failure");
    expect(failure).toBeDefined();
    expect(failure!.severity).toBe("risk");
    expect(failure!.detail).toContain("SO-218");
    expect(failure!.detail).toContain("INV-90");
    expect(failure!.detail).toContain("IG-Ananya");
    expect(ex.find((e) => e.code === "payment.uncollected")).toBeUndefined();
  });
});

describe("collections.escalated exception", () => {
  it("fires when nudge_count >= 3 and invoice unpaid", () => {
    const invoice = node("inv1", "Invoice", "Invoice:INV-90", "INV-90", {
      status: "overdue",
      nudge_count: 3,
      amountInPaise: 1480000,
    });
    const ex = evaluateExceptions([invoice], []);
    const escalated = ex.find((e) => e.code === "collections.escalated");
    expect(escalated).toBeDefined();
    expect(escalated!.severity).toBe("risk");
    expect(escalated!.title).toContain("collections escalated");
  });

  it("does not fire when invoice is paid", () => {
    const invoice = node("inv1", "Invoice", "Invoice:INV-90", "INV-90", {
      status: "paid",
      nudge_count: 3,
    });
    const ex = evaluateExceptions([invoice], []);
    expect(ex.find((e) => e.code === "collections.escalated")).toBeUndefined();
  });
});
