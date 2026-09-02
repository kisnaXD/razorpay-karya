import { ShapeWrapper, strokeProps } from "./shared";
import type { KaryaNodeData } from "../types";

export function CapsuleNode({ data }: { data: KaryaNodeData }) {
  return (
    <ShapeWrapper data={data}>
      <rect x={0} y={9} width={36} height={18} rx={9} {...strokeProps} />
    </ShapeWrapper>
  );
}
