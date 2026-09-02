import { ShapeWrapper, strokeProps } from "./shared";
import type { KaryaNodeData } from "../types";

export function RoundedSquareNode({ data }: { data: KaryaNodeData }) {
  return (
    <ShapeWrapper data={data}>
      <rect x={4} y={4} width={28} height={28} rx={6} {...strokeProps} />
    </ShapeWrapper>
  );
}
