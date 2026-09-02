import { ShapeWrapper, strokeProps } from "./shared";
import type { KaryaNodeData } from "../types";

export function SmallSquareNode({ data }: { data: KaryaNodeData }) {
  return (
    <ShapeWrapper data={data}>
      <rect x={9} y={9} width={18} height={18} {...strokeProps} />
    </ShapeWrapper>
  );
}
