import {
  createPayoutAdapter,
  RazorpayClient,
  type PayoutAdapter,
} from "@karya/razorpay";
import type { Env } from "../env.js";
import { razorpayConfigured, razorpayxConfigured } from "../env.js";

export function buildPayoutAdapter(env: Env): PayoutAdapter {
  let client: RazorpayClient | undefined;
  if (razorpayxConfigured(env)) {
    client = new RazorpayClient({
      keyId: env.RAZORPAYX_KEY_ID!,
      keySecret: env.RAZORPAYX_KEY_SECRET!,
    });
  }

  return createPayoutAdapter({
    provider: env.PAYOUT_PROVIDER,
    razorpayxConfigured: razorpayxConfigured(env),
    ...(client ? { client } : {}),
  });
}

export function buildRazorpayClient(env: Env): RazorpayClient | null {
  if (!razorpayConfigured(env)) {
    return null;
  }
  return new RazorpayClient({
    keyId: env.RAZORPAY_KEY_ID!,
    keySecret: env.RAZORPAY_KEY_SECRET!,
  });
}
