import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ToolTraceRow } from "./ToolTraceRow";

afterEach(cleanup);

describe("ToolTraceRow", () => {
  it("renders copper border when running", () => {
    const { container } = render(
      <ToolTraceRow
        toolName="inventory_promise_query"
        sideEffectClass="read"
        status="running"
        explanation="Checking whether 8 Diya-Large can ship Friday"
      />,
    );
    expect(container.querySelector(".border-l-copper")).not.toBeNull();
    expect(container.querySelector("[data-status='running']")).not.toBeNull();
    expect(screen.getByText("Queried inventory")).not.toBeNull();
  });

  it("mutes when done", () => {
    const { container } = render(
      <ToolTraceRow
        toolName="sales_get_order_book"
        sideEffectClass="read"
        status="done"
        explanation="Listing open sales orders"
      />,
    );
    expect(container.querySelector(".border-l-line")).not.toBeNull();
    expect(container.querySelector(".text-muted")).not.toBeNull();
    expect(screen.getByText("Checked orders")).not.toBeNull();
  });

  it("expands details on click", () => {
    render(
      <ToolTraceRow
        toolName="sourcing_search_vendors"
        sideEffectClass="read"
        status="done"
        explanation="Finding brass vendors in Gujarat"
        outputSummary="3 matches"
      />,
    );
    expect(screen.queryByText("Finding brass vendors in Gujarat")).toBeNull();
    fireEvent.click(screen.getByText("Searched vendors"));
    expect(screen.getByText("Finding brass vendors in Gujarat")).not.toBeNull();
    expect(screen.getByText("3 matches")).not.toBeNull();
  });
});
