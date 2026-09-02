import { ShapeWrapper, strokeProps } from "./shared";
import type { KaryaNodeData } from "../types";

export function ChevronLeftNode({ data }: { data: KaryaNodeData }) {
  return (
    <ShapeWrapper data={data}>
      <polygon points="28,10 12,18 28,26" {...strokeProps} />
    </ShapeWrapper>
  );
}
