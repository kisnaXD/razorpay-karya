import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentInbox, ExceptionList } from "./ExceptionList";
import type { ApiException, InboxAction } from "@/lib/api";

afterEach(cleanup);

const exceptions: ApiException[] = [
  {
    id: "ex_risk",
    severity: "risk",
    code: "invoice.overdue",
    nodeId: "n1",
    nodeKey: "Invoice:INV-90",
    title: "INV-90 is overdue",
    detail: "Payment is past due.",
    why: "₹12,400 payment overdue — affects cash flow",
    recommendation: "Send payment reminder to customer",
    domain: "finance",
    priority: "critical",
    actions: [
      {
        id: "send-reminder",
        label: "Send reminder",
        kind: "agent_prompt",
        payload: { message: "Send a payment reminder for Invoice:INV-90" },
      },
      {
        id: "view-invoice",
        label: "View invoice",
        kind: "navigate",
        payload: { nodeKey: "Invoice:INV-90" },
      },
    ],
  },
  {
    id: "ex_warn",
    severity: "warn",
    code: "shipment.delayed",
    nodeId: "n2",
    nodeKey: "Shipment:IN-77",
    title: "Shipment delayed",
    detail: "IN-77 is late.",
    why: "Inbound shipment delayed — material arrival at risk",
    recommendation: "Check alternate suppliers or adjust timeline",
    domain: "procurement",
    priority: "medium",
    actions: [
      {
        id: "investigate",
        label: "Investigate",
        kind: "agent_prompt",
        payload: { message: "Investigate the delay for Shipment:IN-77" },
      },
    ],
  },
];

describe("AgentInbox", () => {
  it("groups by priority and shows why / recommendation", () => {
    render(
      <AgentInbox
        exceptions={exceptions}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByText(/Critical · 1/)).toBeTruthy();
    expect(screen.getByText(/Medium · 1/)).toBeTruthy();
    expect(screen.getAllByText(/Why:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Recommendation:/).length).toBeGreaterThan(0);
    expect(screen.getByText("Send reminder")).toBeTruthy();
  });

  it("shows all-clear empty state", () => {
    render(<AgentInbox exceptions={[]} onAction={vi.fn()} />);
    expect(screen.getByText("All clear")).toBeTruthy();
  });

  it("fires onAction for agent prompts and navigate", () => {
    const onAction = vi.fn();
    const onNavigate = vi.fn();
    render(
      <AgentInbox
        exceptions={exceptions}
        onAction={onAction}
        onNavigate={onNavigate}
      />,
    );
    fireEvent.click(screen.getByText("Send reminder"));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "agent_prompt",
        label: "Send reminder",
      } satisfies Partial<InboxAction>),
    );

    fireEvent.click(screen.getByText("View invoice"));
    expect(onNavigate).toHaveBeenCalledWith("Invoice:INV-90");
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "navigate" }),
    );
  });

  it("re-exports ExceptionList as AgentInbox alias", () => {
    expect(ExceptionList).toBe(AgentInbox);
  });
});
