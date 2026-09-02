import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuyerAgentPanel } from "./BuyerAgentPanel";

vi.mock("@/lib/a2a-client", () => ({
  a2aGet: vi.fn(),
  a2aPost: vi.fn(),
}));

import { a2aGet, a2aPost } from "@/lib/a2a-client";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BuyerAgentPanel", () => {
  it("runs demo and logs catalog, session, and complete HTTP calls", async () => {
    vi.mocked(a2aGet).mockResolvedValue({
      status: 200,
      durationMs: 12,
      data: {
        items: [
          {
            skuKey: "SKU:Diya-Large",
            priceInPaise: 185000,
            availableQty: 3,
            inStock: true,
            leadDays: 5,
          },
        ],
      },
    });

    vi.mocked(a2aPost)
      .mockResolvedValueOnce({
        status: 200,
        durationMs: 18,
        data: { session: { id: "cs_test_session" } },
      })
      .mockResolvedValueOnce({
        status: 200,
        durationMs: 40,
        data: {
          order: { orderKey: "SalesOrder:SO-A2A-TEST01" },
          payment: {
            shortUrl: "https://rzp.io/i/demo",
            paymentLinkId: "plink_demo",
          },
        },
      });

    const onOrderPlaced = vi.fn();
    render(<BuyerAgentPanel onOrderPlaced={onOrderPlaced} />);

    fireEvent.click(screen.getByRole("button", { name: "Run demo query" }));

    await waitFor(() => {
      expect(screen.getByText("/a2a/catalog")).toBeTruthy();
    });
    expect(screen.getByText("/a2a/checkout/sessions")).toBeTruthy();
    expect(
      screen.getByText("/a2a/checkout/sessions/cs_test_session/complete"),
    ).toBeTruthy();
    expect(onOrderPlaced).toHaveBeenCalledWith("SalesOrder:SO-A2A-TEST01");
  });
});
