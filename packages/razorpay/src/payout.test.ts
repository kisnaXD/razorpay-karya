import { describe, expect, it } from "vitest";
import {
  LedgerPayoutProvider,
  createPayoutAdapter,
} from "./payout.js";

describe("PayoutAdapter", () => {
  it("LedgerPayoutProvider works without external keys", async () => {
    const adapter = new LedgerPayoutProvider();
    const result = await adapter.proposePayout({
      orgId: "org_arka",
      vendorOrgKey: "Org:Meenakshi-Brass",
      amountInPaise: 2500000,
      purpose: "vendor_payment",
      idempotencyKey: "karya_org_arka_payout_po104",
      explanation: "PO-104 brass sheet",
    });

    expect(result).toEqual({
      provider: "ledger",
      payoutId: "ledger_karya_org_arka_payout_po104",
      status: "queued",
    });
  });

  it("createPayoutAdapter defaults to ledger when razorpayx not configured", () => {
    const adapter = createPayoutAdapter({
      provider: "razorpayx",
      razorpayxConfigured: false,
    });
    expect(adapter).toBeInstanceOf(LedgerPayoutProvider);
  });

  it("createPayoutAdapter uses ledger when provider is ledger", () => {
    const adapter = createPayoutAdapter({
      provider: "ledger",
      razorpayxConfigured: true,
    });
    expect(adapter).toBeInstanceOf(LedgerPayoutProvider);
  });
});
