import { describe, expect, it, vi } from "vitest";
import type { NodeRecord } from "@karya/graph";
import { handlePaymentFailure } from "./handle-failure.js";

function paymentNode(
  props: NodeRecord["props"] = { status: "expired", amountInPaise: 1480000 },
): NodeRecord {
  const now = new Date();
  return {
    _id: "id_pay",
    orgId: "org_arka",
    type: "Payment",
    key: "Payment:plink_7",
    label: "plink_7",
    props,
    createdAt: now,
    updatedAt: now,
  };
}

describe("handlePaymentFailure idempotency", () => {
  it("skips creating approvals when pending recovery already exists", async () => {
    const payment = paymentNode();
    const createApproval = vi.fn();
    const writeAudit = vi.fn();
    const findPending = vi.fn(async () => [
      "appr_1",
      "appr_2",
      "appr_3",
    ]);

    const store = {
      getNodeByKey: async () => payment,
      getNode: async () => payment,
      upsertNode: vi.fn(async (n: NodeRecord) => n),
      neighborhood: async () => ({ nodes: [payment], edges: [] }),
    };

    const result = await handlePaymentFailure(
      store as never,
      "org_arka",
      "Payment:plink_7",
      "payment_link.expired",
      {
        createApproval,
        writeAudit,
        findPendingRecoveryApprovals: findPending,
      },
    );

    expect(result.status).toBe("already_pending");
    expect(result.approvalIds).toEqual(["appr_1", "appr_2", "appr_3"]);
    expect(createApproval).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("skips when recovery_pending flag is set on the payment", async () => {
    const payment = paymentNode({
      status: "expired",
      amountInPaise: 1480000,
      recovery_pending: true,
    });
    const createApproval = vi.fn();

    const store = {
      getNodeByKey: async () => payment,
      getNode: async () => payment,
      upsertNode: vi.fn(async (n: NodeRecord) => n),
      neighborhood: async () => ({ nodes: [payment], edges: [] }),
    };

    const result = await handlePaymentFailure(
      store as never,
      "org_arka",
      "Payment:plink_7",
      "payment_link.expired",
      {
        createApproval,
        writeAudit: async () => ({}),
      },
    );

    expect(result.status).toBe("already_pending");
    expect(createApproval).not.toHaveBeenCalled();
  });
});
