import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LedgerView } from "./LedgerView";

vi.mock("@/lib/console-context", () => ({
  useConsole: () => ({
    setView: vi.fn(),
    reload: vi.fn(),
  }),
}));

vi.mock("@/lib/api", () => ({
  fetchLedger: async () => ({
    cashInPaise: 0,
    receivablesInPaise: 1480000,
    payablesInPaise: 0,
    payoutsOutInPaise: 0,
    entries: [
      {
        node: {
          _id: "p1",
          type: "Payment",
          key: "Payment:plink_7",
          label: "plink_7",
          props: {},
        },
        direction: "in",
        amountInPaise: 1480000,
        status: "sent",
        counterparty: "Lotus Boutique",
        at: new Date().toISOString(),
      },
    ],
  }),
  fetchAuditFiltered: async () => [],
  simulateWebhook: async () => ({ received: true }),
}));

afterEach(cleanup);

describe("LedgerView", () => {
  it("renders ledger summary and payment row", async () => {
    render(<LedgerView />);
    expect(await screen.findByText("Money")).toBeTruthy();
    expect(await screen.findByText("plink_7")).toBeTruthy();
    expect(screen.getByText("Lotus Boutique")).toBeTruthy();
    expect(screen.getByText("Policies →")).toBeTruthy();
  });
});
