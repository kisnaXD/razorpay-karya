import type { KaryaNodeData } from "../types";
import { ShapeWrapper, strokeProps } from "./shared";

export function CircleNode({ data }: { data: KaryaNodeData }) {
  return (
    <ShapeWrapper data={data}>
      <circle cx={18} cy={18} r={14} {...strokeProps} />
    </ShapeWrapper>
  );
}
