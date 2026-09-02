import { ShapeWrapper, strokeProps } from "./shared";
import type { KaryaNodeData } from "../types";

export function FileNode({ data }: { data: KaryaNodeData }) {
  return (
    <ShapeWrapper data={data}>
      <rect x={10} y={6} width={16} height={24} {...strokeProps} />
    </ShapeWrapper>
  );
}
