import { describe, expect, it, vi } from "vitest";
import type { NodeRecord } from "@karya/graph";
import {
  countPaymentLinkCreatedEvents,
  runCollectionsLoop,
} from "./collections-loop.js";

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

describe("countPaymentLinkCreatedEvents", () => {
  it("counts payment_link.created events for an invoice", () => {
    const events = [
      node("Event:1", "Event", "payment_link.created", {
        event_type: "payment_link.created",
        payload_json: JSON.stringify({ invoiceKey: "Invoice:INV-90" }),
      }),
      node("Event:2", "Event", "payment_link.created", {
        event_type: "payment_link.created",
        payload_json: JSON.stringify({ invoiceKey: "Invoice:INV-90" }),
      }),
      node("Event:3", "Event", "other", {
        event_type: "other",
        payload_json: JSON.stringify({ invoiceKey: "Invoice:INV-90" }),
      }),
    ];
    expect(countPaymentLinkCreatedEvents(events, "Invoice:INV-90")).toBe(2);
  });
});

describe("runCollectionsLoop", () => {
  it("escalates when nudge_count >= 3", async () => {
    const invoice = node("Invoice:INV-90", "Invoice", "INV-90", {
      status: "overdue",
      amountInPaise: 1480000,
      nudge_count: 3,
    });

    const upsertNode = vi.fn(async (n: NodeRecord) => n);
    const store = {
      exceptions: async () => [
        {
          id: "ex1",
          severity: "risk" as const,
          code: "invoice.overdue",
          nodeId: invoice._id,
          title: "overdue",
          detail: "x",
        },
      ],
      getNode: async () => invoice,
      getNodeByKey: async () => invoice,
      upsertNode,
      neighborhood: async () => ({ nodes: [], edges: [] }),
    };

    const result = await runCollectionsLoop(store as never, "org_arka", {
      evaluate: async () => ({ finalDecision: "allow", results: [] }),
      createApproval: async () => ({ autoAllowed: true, evaluation: { finalDecision: "allow", results: [] } }),
      createLink: async () => ({ paymentNode: { key: "Payment:x" }, created: true }),
      audit: async () => ({}),
    });

    expect(result.processed).toEqual([
      { invoiceKey: "Invoice:INV-90", outcome: "escalated" },
    ]);
    expect(upsertNode).toHaveBeenCalled();
  });

  it("skips when an active sent payment link exists", async () => {
    const invoice = node("Invoice:INV-90", "Invoice", "INV-90", {
      status: "overdue",
      amountInPaise: 1480000,
      nudge_count: 1,
    });
    const payment = node("Payment:plink_7", "Payment", "plink_7", {
      status: "sent",
    });

    const store = {
      exceptions: async () => [
        {
          id: "ex1",
          severity: "risk" as const,
          code: "invoice.overdue",
          nodeId: invoice._id,
          title: "overdue",
          detail: "x",
        },
      ],
      getNode: async () => invoice,
      getNodeByKey: async () => invoice,
      upsertNode: async (n: NodeRecord) => n,
      neighborhood: async () => ({
        nodes: [invoice, payment],
        edges: [
          {
            _id: "e1",
            orgId: "org_arka",
            type: "PAYS",
            fromId: payment._id,
            toId: invoice._id,
            props: {},
            validFrom: new Date(),
            validTo: null,
          },
        ],
      }),
    };

    const createLink = vi.fn();
    const result = await runCollectionsLoop(store as never, "org_arka", {
      evaluate: async () => ({ finalDecision: "allow", results: [] }),
      createApproval: async () => ({
        autoAllowed: true,
        evaluation: { finalDecision: "allow", results: [] },
      }),
      createLink,
      audit: async () => ({}),
    });

    expect(result.processed[0]!.outcome).toBe("skipped");
    expect(createLink).not.toHaveBeenCalled();
  });

  it("skips when linked payment is expired (recovery owns it)", async () => {
    const invoice = node("Invoice:INV-90", "Invoice", "INV-90", {
      status: "overdue",
      amountInPaise: 1480000,
      nudge_count: 1,
    });
    const payment = node("Payment:plink_7", "Payment", "plink_7", {
      status: "expired",
    });

    const store = {
      exceptions: async () => [
        {
          id: "ex1",
          severity: "risk" as const,
          code: "invoice.overdue",
          nodeId: invoice._id,
          title: "overdue",
          detail: "x",
        },
      ],
      getNode: async () => invoice,
      getNodeByKey: async () => invoice,
      upsertNode: async (n: NodeRecord) => n,
      neighborhood: async () => ({
        nodes: [invoice, payment],
        edges: [
          {
            _id: "e1",
            orgId: "org_arka",
            type: "PAYS",
            fromId: payment._id,
            toId: invoice._id,
            props: {},
            validFrom: new Date(),
            validTo: null,
          },
        ],
      }),
    };

    const createLink = vi.fn();
    const result = await runCollectionsLoop(store as never, "org_arka", {
      evaluate: async () => ({ finalDecision: "allow", results: [] }),
      createApproval: async () => ({
        autoAllowed: true,
        evaluation: { finalDecision: "allow", results: [] },
      }),
      createLink,
      audit: async () => ({}),
    });

    expect(result.processed[0]!.outcome).toBe("skipped");
    expect(createLink).not.toHaveBeenCalled();
  });
});
