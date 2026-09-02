import type { RazorpayClient } from "./client.js";
import type { RazorpayPaymentLink } from "./types.js";

export type CreatePaymentLinkInput = {
  amountInPaise: number;
  currency?: "INR";
  description: string;
  customer?: { name: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  expireBy?: number;
};

export async function createPaymentLink(
  client: RazorpayClient,
  input: CreatePaymentLinkInput,
  idempotencyKey: string,
): Promise<RazorpayPaymentLink> {
  return client.post<RazorpayPaymentLink>(
    "/payment_links",
    {
      amount: input.amountInPaise,
      currency: input.currency ?? "INR",
      description: input.description,
      customer: input.customer,
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: input.notes,
      expire_by: input.expireBy,
    },
    idempotencyKey,
  );
}
