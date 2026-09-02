import { describe, expect, it } from "vitest";
import { enrichExceptions } from "./inbox-enrichment.js";
import type { Exception } from "./types.js";

function base(partial: Partial<Exception> & Pick<Exception, "code" | "severity">): Exception {
  return {
    id: partial.id ?? "ex1",
    nodeId: partial.nodeId ?? "n1",
    nodeKey: partial.nodeKey ?? "Invoice:INV-104",
    title: partial.title ?? "Test",
    detail: partial.detail ?? "detail",
    ...partial,
  };
}

describe("enrichExceptions", () => {
  it("enriches invoice.overdue with finance domain and amount from detail", () => {
    const enriched = enrichExceptions([
      base({
        code: "invoice.overdue",
        severity: "risk",
        detail: "Buyer link for Invoice:INV-104 expired — ₹12,400 still due.",
        nodeKey: "Invoice:INV-104",
      }),
    ]);
    const ex = enriched[0]!;
    expect(ex.domain).toBe("finance");
    expect(ex.priority).toBe("critical");
    expect(ex.why).toContain("₹12,400");
    expect(ex.recommendation).toMatch(/reminder/i);
    expect(ex.actions?.[0]?.kind).toBe("agent_prompt");
    expect(ex.actions?.[0]?.payload.message).toContain("Invoice:INV-104");
    expect(ex.actions?.[1]?.kind).toBe("navigate");
  });

  it("maps payment.failure risk to critical", () => {
    const ex = enrichExceptions([
      base({
        code: "payment.failure",
        severity: "risk",
        nodeKey: "Payment:plink_7",
      }),
    ])[0]!;
    expect(ex.priority).toBe("critical");
    expect(ex.domain).toBe("finance");
  });

  it("maps stock.promise_risk to high (non-payment risk)", () => {
    const ex = enrichExceptions([
      base({
        code: "stock.promise_risk",
        severity: "risk",
        nodeKey: "SalesOrder:SO-218",
      }),
    ])[0]!;
    expect(ex.priority).toBe("high");
    expect(ex.domain).toBe("sales");
  });

  it("maps warn severity to medium", () => {
    const ex = enrichExceptions([
      base({
        code: "po.late",
        severity: "warn",
        nodeKey: "PurchaseOrder:PO-104",
      }),
    ])[0]!;
    expect(ex.priority).toBe("medium");
    expect(ex.domain).toBe("procurement");
    expect(ex.actions?.map((a) => a.label)).toEqual([
      "Chase vendor",
      "Find alternates",
    ]);
  });
});
