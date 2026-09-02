import { createHmac } from "node:crypto";
import type { RazorpayWebhookPayload } from "./webhooks.js";

export function signWebhookBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function buildSimulatedWebhookPayload(input: {
  event: "payment_link.expired" | "payment.failed" | "payment_link.paid";
  paymentLinkId: string;
  amountInPaise: number;
  orgId: string;
  invoiceKey?: string;
  paymentId?: string;
}): { body: string; payload: RazorpayWebhookPayload } {
  if (input.event === "payment.failed") {
    const paymentId = input.paymentId ?? `pay_sim_${input.paymentLinkId}`;
    const payload: RazorpayWebhookPayload = {
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: paymentId,
            status: "failed",
            amount: input.amountInPaise,
            notes: {
              org_id: input.orgId,
              ...(input.invoiceKey ? { invoice_key: input.invoiceKey } : {}),
            },
          },
        },
        payment_link: {
          entity: {
            id: input.paymentLinkId,
            short_url: `https://rzp.io/i/${input.paymentLinkId}`,
            amount: input.amountInPaise,
            currency: "INR",
            status: "expired",
            created_at: Math.floor(Date.now() / 1000),
            notes: {
              org_id: input.orgId,
              ...(input.invoiceKey ? { invoice_key: input.invoiceKey } : {}),
            },
          },
        },
      },
    };
    return { body: JSON.stringify(payload), payload };
  }

  const status =
    input.event === "payment_link.paid" ? ("paid" as const) : ("expired" as const);
  const payload: RazorpayWebhookPayload = {
    event: input.event,
    payload: {
      payment_link: {
        entity: {
          id: input.paymentLinkId,
          short_url: `https://rzp.io/i/${input.paymentLinkId}`,
          amount: input.amountInPaise,
          currency: "INR",
          status,
          created_at: Math.floor(Date.now() / 1000),
          notes: {
            org_id: input.orgId,
            ...(input.invoiceKey ? { invoice_key: input.invoiceKey } : {}),
          },
        },
      },
    },
  };
  return { body: JSON.stringify(payload), payload };
}
