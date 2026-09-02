import { ShapeWrapper } from "./shared";
import type { KaryaNodeData } from "../types";

export function PaymentDiscNode({ data }: { data: KaryaNodeData }) {
  return (
    <ShapeWrapper data={data}>
      <circle
        cx={18}
        cy={18}
        r={12}
        className="shape-fill payment-fill"
        fill="var(--teal)"
        stroke="var(--teal)"
        strokeWidth={1.5}
      />
    </ShapeWrapper>
  );
}
