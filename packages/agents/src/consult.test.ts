import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CoreTool } from "ai";
import type { ToolContext } from "./types.js";

const generateTextMock = vi.fn();

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateText: (...args: unknown[]) => generateTextMock(...args),
  };
});

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => (model: string) => ({ modelId: model }),
}));

import { consultAgent, consultAgentsParallel } from "./consult.js";
import { toolNamesForAgent } from "./registry.js";

function stubToolContext(): ToolContext {
  return {
    orgId: "org_arka",
    store: {} as ToolContext["store"],
    evaluateAction: async () => ({ decision: "allow" }) as never,
    createApproval: async () => ({ autoAllowed: true, evaluation: {} }) as never,
    createPaymentLink: async () => ({
      paymentNode: { key: "Payment:x" },
      razorpay: { short_url: "https://rzp.io/x" },
      created: true,
    }),
    writeAudit: async () => ({}),
    promiseQuery: async () =>
      ({
        verdict: "yes",
        blockers: [],
      }) as never,
    getOrderBook: async () => [],
    generateQuote: async () => ({}) as never,
    acceptSalesOrder: async () => ({}) as never,
    rejectSalesOrder: async () => ({}) as never,
  };
}

describe("consultAgent", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    generateTextMock.mockResolvedValue({
      text: "Finding: cash tight. Evidence: Invoice:INV-90. Risk: high. Recommendation: collect.",
    });
  });

  it("finance consult uses only finance tool names", async () => {
    const finding = await consultAgent("finance", "What is our cash risk?", {
      model: "gpt-4o-mini",
      apiKey: "test-key",
      orgId: "org_arka",
      orgLabel: "Arka Atelier",
      contextNodeKey: null,
      exceptionCount: 0,
      toolContext: stubToolContext(),
    });

    expect(finding.status).toBe("done");
    expect(finding.agentId).toBe("finance");
    expect(finding.findings).toContain("cash tight");

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const call = generateTextMock.mock.calls[0]![0] as {
      tools: Record<string, CoreTool>;
      maxSteps: number;
      system: string;
    };
    expect(call.maxSteps).toBe(8);
    expect(call.system).toContain("Finance Agent");

    const financeNames = new Set(toolNamesForAgent("finance"));
    const usedNames = Object.keys(call.tools);
    expect(usedNames.length).toBeGreaterThan(0);
    for (const name of usedNames) {
      expect(financeNames.has(name)).toBe(true);
    }
    expect(usedNames).not.toContain("sales_accept_order");
    expect(usedNames).not.toContain("sourcing_draft_po");
  });

  it("consultAgentsParallel runs requests concurrently", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    generateTextMock.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 30));
      inFlight -= 1;
      return { text: "ok" };
    });

    const results = await consultAgentsParallel(
      [
        { agentId: "finance", question: "Cash runway this month?" },
        { agentId: "sales", question: "Pipeline risk this week?" },
        { agentId: "procurement", question: "Any late POs?" },
      ],
      {
        model: "gpt-4o-mini",
        apiKey: "test-key",
        orgId: "org_arka",
        orgLabel: "Arka Atelier",
        contextNodeKey: null,
        exceptionCount: 0,
        toolContext: stubToolContext(),
      },
    );

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === "done")).toBe(true);
    expect(maxInFlight).toBeGreaterThanOrEqual(2);
  });
});
