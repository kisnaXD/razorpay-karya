import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalCard } from "./ApprovalCard";

afterEach(cleanup);

describe("ApprovalCard", () => {
  it("renders copper edge, amount, and action buttons", () => {
    const onApprove = vi.fn();
    const onEdit = vi.fn();
    const onReject = vi.fn();

    const { container } = render(
      <ApprovalCard
        id="appr_test"
        title="Send Payment Link for INV-90"
        amountInPaise={1480000}
        why="Overdue B2B invoice needs collection."
        policyLabel="Collect invoice policy"
        policyDecision="require_approval"
        onApprove={onApprove}
        onEdit={onEdit}
        onReject={onReject}
      />,
    );

    expect(container.querySelector(".border-l-copper")).not.toBeNull();
    expect(screen.getByText("₹14,800")).toBeTruthy();
    expect(screen.getByText(/Collect invoice policy/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();
  });

  it("calls handlers when buttons are clicked", () => {
    const onApprove = vi.fn();
    const onEdit = vi.fn();
    const onReject = vi.fn();

    render(
      <ApprovalCard
        id="appr_test"
        title="Pay vendor Meenakshi Brass"
        amountInPaise={2000000}
        why="Partial PO-104 payment."
        policyLabel="Pay vendor policy"
        policyDecision="require_approval"
        onApprove={onApprove}
        onEdit={onEdit}
        onReject={onReject}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(onApprove).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onReject).toHaveBeenCalledOnce();
  });

  it("renders recovery why with SO-218 and IG-Ananya", () => {
    render(
      <ApprovalCard
        id="appr_recovery"
        title="Retry Payment Link for INV-90"
        amountInPaise={1480000}
        why="Lotus Boutique's Payment Link for INV-90 (₹14,800) expired. SO-218's 8× Diya-Large promised Friday remain reserved (9 units held at Workshop). Lead IG-Ananya is waiting on the same SKU."
        policyLabel="Money recovery"
        policyDecision="require_approval"
        onApprove={() => undefined}
        onEdit={() => undefined}
        onReject={() => undefined}
      />,
    );
    expect(screen.getByText(/SO-218/)).toBeTruthy();
    expect(screen.getByText(/IG-Ananya/)).toBeTruthy();
  });
});
