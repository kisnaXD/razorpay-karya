import { ShapeWrapper, strokeProps } from "./shared";
import type { KaryaNodeData } from "../types";

export function QuoteNode({ data }: { data: KaryaNodeData }) {
  return (
    <ShapeWrapper data={data}>
      <path
        d="M8 10 H20 C24 10 26 14 26 18 V26 H14 V18 H20"
        {...strokeProps}
      />
    </ShapeWrapper>
  );
}
