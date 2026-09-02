import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KaryaNode } from "./KaryaNode";
import { PaymentDiscNode } from "./shapes/PaymentDiscNode";
import type { KaryaNodeProps } from "./types";

describe("KaryaNode", () => {
  it("renders Payment node with teal fill", () => {
    const { container } = render(
      <PaymentDiscNode
        data={{
          nodeKey: "Payment:plink_7",
          label: "plink_7",
          nodeType: "Payment",
          selected: false,
          highlighted: false,
        }}
      />,
    );
    expect(container.querySelector(".payment-fill")).not.toBeNull();
  });

  it("applies exception-pulse when the node has an exception", () => {
    const { container } = render(
      <KaryaNode
        {...({
          data: {
            nodeKey: "Invoice:INV-90",
            label: "INV-90",
            nodeType: "Invoice",
            selected: false,
            highlighted: false,
            exceptionSeverity: "risk",
          },
          dragging: false,
        } as KaryaNodeProps)}
      />,
    );
    expect(container.querySelector(".exception-pulse")).not.toBeNull();
  });
});
