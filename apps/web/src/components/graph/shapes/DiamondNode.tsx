import { ShapeWrapper, strokeProps } from "./shared";
import type { KaryaNodeData } from "../types";

export function DiamondNode({ data }: { data: KaryaNodeData }) {
  return (
    <ShapeWrapper data={data}>
      <rect
        x={18}
        y={6}
        width={24}
        height={24}
        transform="rotate(45 18 18)"
        {...strokeProps}
      />
    </ShapeWrapper>
  );
}
