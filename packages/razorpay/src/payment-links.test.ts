import { afterEach, describe, expect, it, vi } from "vitest";
import { RazorpayClient } from "./client.js";
import { idempotencyKey } from "./idempotency.js";
import { createPaymentLink } from "./payment-links.js";

describe("RazorpayClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends Authorization and idempotency headers on POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "plink_test",
        short_url: "https://rzp.io/i/test",
        amount: 1480000,
        currency: "INR",
        status: "created",
        created_at: 1234567890,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new RazorpayClient({
      keyId: "rzp_test_key",
      keySecret: "secret123",
    });
    const key = idempotencyKey("org_arka", "payment_link", "Invoice:INV-90");

    await createPaymentLink(
      client,
      {
        amountInPaise: 1480000,
        description: "Invoice INV-90",
        customer: { name: "Lotus Boutique" },
      },
      key,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/payment_links");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    const expectedAuth = `Basic ${Buffer.from("rzp_test_key:secret123").toString("base64")}`;
    expect(headers.Authorization).toBe(expectedAuth);
    expect(headers["X-Razorpay-Idempotency-Key"]).toBe(key);
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("throws RazorpayError on non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { description: "bad request" } }),
      }),
    );

    const client = new RazorpayClient({
      keyId: "rzp_test",
      keySecret: "secret",
    });

    await expect(
      client.post("/payment_links", { amount: 100 }, "key_1"),
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("payment_links"),
    });
  });
});

describe("idempotencyKey", () => {
  it("formats stable keys with sanitized refs", () => {
    expect(idempotencyKey("org_arka", "payment_link", "Invoice:INV-90")).toBe(
      "karya_org_arka_payment_link_Invoice_INV-90",
    );
  });
});
