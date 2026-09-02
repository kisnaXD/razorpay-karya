import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "./webhooks.js";

const SECRET = "whsec_test_secret";
const BODY = JSON.stringify({
  event: "payment_link.paid",
  payload: {
    payment_link: {
      entity: {
        id: "plink_test123",
        short_url: "https://rzp.io/i/test",
        amount: 1480000,
        currency: "INR",
        status: "paid",
        created_at: 1700000000,
      },
    },
  },
});

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("verifyWebhookSignature", () => {
  it("returns true for valid signature", () => {
    const signature = sign(BODY, SECRET);
    expect(verifyWebhookSignature(BODY, signature, SECRET)).toBe(true);
  });

  it("returns true when raw body is a Buffer", () => {
    const signature = sign(BODY, SECRET);
    expect(verifyWebhookSignature(Buffer.from(BODY), signature, SECRET)).toBe(
      true,
    );
  });

  it("returns false for invalid signature", () => {
    expect(
      verifyWebhookSignature(BODY, "deadbeef".repeat(8), SECRET),
    ).toBe(false);
  });

  it("returns false for wrong secret", () => {
    const signature = sign(BODY, SECRET);
    expect(verifyWebhookSignature(BODY, signature, "wrong_secret")).toBe(false);
  });
});
