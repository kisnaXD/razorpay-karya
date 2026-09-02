import { describe, expect, it } from "vitest";
import type { NodeRecord } from "@karya/graph";
import { classifyPaymentFailure } from "./classify-failure.js";
import { buildRecoveryProposals } from "./recovery-options.js";
import type { FailureImpact } from "./impact-copy.js";

function node(
  key: string,
  type: NodeRecord["type"],
  label: string,
  props: NodeRecord["props"] = {},
): NodeRecord {
  const now = new Date();
  return {
    _id: `id_${key}`,
    orgId: "org_arka",
    type,
    key,
    label,
    props,
    createdAt: now,
    updatedAt: now,
  };
}

describe("classifyPaymentFailure", () => {
  it("maps webhook events to failure classes", () => {
    const payment = node("Payment:plink_7", "Payment", "plink_7", {
      status: "sent",
    });
    expect(
      classifyPaymentFailure(payment, "payment_link.expired"),
    ).toBe("expired");
    expect(classifyPaymentFailure(payment, "payment.failed")).toBe("failed");
    expect(
      classifyPaymentFailure(
        node("Payment:x", "Payment", "x", { status: "cancelled" }),
        "other",
      ),
    ).toBe("cancelled");
  });
});

describe("buildRecoveryProposals", () => {
  it("returns three options in fixed order", () => {
    const impact: FailureImpact = {
      payment: node("Payment:plink_7", "Payment", "plink_7", {
        amountInPaise: 1480000,
        status: "expired",
      }),
      invoice: node("Invoice:INV-90", "Invoice", "INV-90", {
        amountInPaise: 1480000,
      }),
      salesOrder: node("SalesOrder:SO-218", "SalesOrder", "SO-218", {
        qty: 8,
        promise_date: "Friday",
      }),
      buyerOrg: node("Org:Lotus-Boutique", "Org", "Lotus Boutique", {}),
      stock: node("Stock:Diya-Large@Workshop", "Stock", "Diya @ Workshop", {
        reserved: 9,
      }),
      sku: node("SKU:Diya-Large", "SKU", "Diya-Large", {}),
      lead: node("Lead:IG-Ananya", "Lead", "IG-Ananya", {}),
      promiseDate: "Friday",
      reservedQty: 9,
      amountInPaise: 1480000,
    };

    const proposals = buildRecoveryProposals(impact);
    expect(proposals.map((p) => p.option)).toEqual([
      "retry_link",
      "hold_stock_48h",
      "release_to_lead",
    ]);
    expect(proposals[0]!.impactSummary).toContain("SO-218");
    expect(proposals[0]!.impactSummary).toContain("IG-Ananya");
  });
});
