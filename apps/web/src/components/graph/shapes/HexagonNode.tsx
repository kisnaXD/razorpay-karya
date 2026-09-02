import { ShapeWrapper, strokeProps } from "./shared";
import type { KaryaNodeData } from "../types";

export function HexagonNode({ data }: { data: KaryaNodeData }) {
  const points = "18,4 30,11 30,25 18,32 6,25 6,11";
  return (
    <ShapeWrapper data={data}>
      <polygon points={points} {...strokeProps} />
    </ShapeWrapper>
  );
}
