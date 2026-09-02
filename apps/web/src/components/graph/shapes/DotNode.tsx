import { ShapeWrapper, strokeProps } from "./shared";
import type { KaryaNodeData } from "../types";

export function DotNode({ data }: { data: KaryaNodeData }) {
  return (
    <ShapeWrapper data={data}>
      <circle cx={18} cy={18} r={6} {...strokeProps} />
    </ShapeWrapper>
  );
}
