import type { RazorpayClient } from "./client.js";

export type PayoutRequest = {
  orgId: string;
  vendorOrgKey: string;
  amountInPaise: number;
  purpose: string;
  idempotencyKey: string;
  explanation: string;
};

export type PayoutResult = {
  provider: "ledger" | "razorpayx";
  payoutId: string;
  status: "queued" | "processed" | "failed";
  razorpayPayoutId?: string;
};

export interface PayoutAdapter {
  proposePayout(req: PayoutRequest): Promise<PayoutResult>;
}

/** Default MVP — writes graph-ready result without bank call */
export class LedgerPayoutProvider implements PayoutAdapter {
  async proposePayout(req: PayoutRequest): Promise<PayoutResult> {
    return {
      provider: "ledger",
      payoutId: `ledger_${req.idempotencyKey}`,
      status: "queued",
    };
  }
}

type RazorpayPayoutResponse = {
  id: string;
  status: string;
};

/** Optional — only when RAZORPAYX keys present */
export class RazorpayXProvider implements PayoutAdapter {
  constructor(private readonly client: RazorpayClient) {}

  async proposePayout(req: PayoutRequest): Promise<PayoutResult> {
    const response = await this.client.post<RazorpayPayoutResponse>(
      "/payouts",
      {
        account_number: req.vendorOrgKey,
        amount: req.amountInPaise,
        currency: "INR",
        mode: "NEFT",
        purpose: req.purpose,
        notes: {
          org_id: req.orgId,
          explanation: req.explanation,
        },
      },
      req.idempotencyKey,
    );

    return {
      provider: "razorpayx",
      payoutId: response.id,
      status: response.status === "processed" ? "processed" : "queued",
      razorpayPayoutId: response.id,
    };
  }
}

export function createPayoutAdapter(env: {
  provider: "ledger" | "razorpayx";
  razorpayxConfigured: boolean;
  client?: RazorpayClient;
}): PayoutAdapter {
  if (env.provider === "razorpayx" && env.razorpayxConfigured && env.client) {
    return new RazorpayXProvider(env.client);
  }
  return new LedgerPayoutProvider();
}
