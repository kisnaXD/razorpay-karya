import { describe, expect, it, vi } from "vitest";
import { buildSystemPrompt } from "./system-prompt.js";
import { runGovernorResume } from "./governor.js";
import { TOOL_SIDE_EFFECTS } from "./tools/index.js";

describe("buildSystemPrompt", () => {
  it("lists tool namespaces and outcome-oriented protocol", () => {
    const prompt = buildSystemPrompt({
      orgLabel: "Arka Atelier",
      contextNodeKey: "SalesOrder:SO-218",
      exceptionCount: 5,
      memories: [],
    });
    expect(prompt).toContain("operations lead");
    expect(prompt).toContain("Observation");
    expect(prompt).toContain("Recommendation");
    expect(prompt).toContain("I noticed 5 items need attention");
    expect(prompt).toContain("root_cause_analysis");
    expect(prompt).toContain("inventory_promise_query");
    expect(prompt).toContain("sales_get_order_book");
    expect(prompt).toContain("money_create_payment_link");
    expect(prompt).toContain("query_graph");
    expect(prompt).toContain("list_all_data");
    expect(prompt).toContain("FULL read access");
    expect(prompt).toContain("awaiting_approval");
    expect(prompt).toContain("SalesOrder:SO-218");
    expect(prompt).toContain("Arka Atelier");
  });

  it("renders organizational memories when provided", () => {
    const prompt = buildSystemPrompt({
      orgLabel: "Arka Atelier",
      contextNodeKey: null,
      exceptionCount: 0,
      memories: [
        "Prefer Org:Shree-Metal-Works for brass sheets",
      ],
    });
    expect(prompt).toContain("Organizational Memory");
    expect(prompt).toContain("Prefer Org:Shree-Metal-Works for brass sheets");
  });
});

describe("TOOL_SIDE_EFFECTS", () => {
  it("marks money tool as money class", () => {
    expect(TOOL_SIDE_EFFECTS.money_create_payment_link).toBe("money");
    expect(TOOL_SIDE_EFFECTS.sales_accept_order).toBe("write");
    expect(TOOL_SIDE_EFFECTS.inventory_promise_query).toBe("read");
    expect(TOOL_SIDE_EFFECTS.query_graph).toBe("read");
    expect(TOOL_SIDE_EFFECTS.list_all_data).toBe("read");
    expect(TOOL_SIDE_EFFECTS.root_cause_analysis).toBe("read");
    expect(TOOL_SIDE_EFFECTS.memory_search).toBe("read");
    expect(TOOL_SIDE_EFFECTS.memory_record).toBe("draft");
  });
});

describe("runGovernorResume", () => {
  it("templates rejection without calling money executor", async () => {
    const executeMoney = vi.fn();
    const result = await runGovernorResume({
      approvalStatus: "rejected",
      pending: {
        approvalId: "appr_1",
        toolEntryId: "entry_1",
        resumePayload: {
          invoiceKey: "Invoice:INV-90",
          explanation: "Collect overdue INV-90",
        },
      },
      executeMoney,
    });
    expect(executeMoney).not.toHaveBeenCalled();
    expect(result.assistantMessage).toMatch(/rejected/);
    expect(result.toolUpdate.status).toBe("error");
  });

  it("executes money tool on approval", async () => {
    const executeMoney = vi.fn().mockResolvedValue({
      status: "created",
      paymentKey: "Payment:plink_x",
      shortUrl: "https://rzp.io/i/x",
    });
    const result = await runGovernorResume({
      approvalStatus: "approved",
      pending: {
        approvalId: "appr_1",
        toolEntryId: "entry_1",
        resumePayload: {
          invoiceKey: "Invoice:INV-90",
          explanation: "Collect overdue INV-90",
        },
      },
      executeMoney,
    });
    expect(executeMoney).toHaveBeenCalledWith({
      invoiceKey: "Invoice:INV-90",
      explanation: "Collect overdue INV-90",
    });
    expect(result.toolUpdate.status).toBe("done");
    expect(result.assistantMessage).toMatch(/Invoice:INV-90/);
  });
});
