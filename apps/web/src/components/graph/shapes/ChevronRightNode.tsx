import { ShapeWrapper, strokeProps } from "./shared";
import type { KaryaNodeData } from "../types";

export function ChevronRightNode({ data }: { data: KaryaNodeData }) {
  return (
    <ShapeWrapper data={data}>
      <polygon points="8,10 24,18 8,26" {...strokeProps} />
    </ShapeWrapper>
  );
}
