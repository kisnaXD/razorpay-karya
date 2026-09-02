import { createHmac, timingSafeEqual } from "node:crypto";
import type { RazorpayPaymentLink } from "./types.js";

export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  try {
    return timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(signature, "utf8"),
    );
  } catch {
    return false;
  }
}

export type RazorpayWebhookPayload = {
  event: string;
  payload: {
    payment_link?: { entity: RazorpayPaymentLink & { notes?: Record<string, string> } };
    payment?: {
      entity: {
        id: string;
        status: string;
        amount: number;
        order_id?: string;
        notes?: Record<string, string>;
      };
    };
    refund?: {
      entity: { id: string; payment_id: string; amount: number };
    };
  };
};
