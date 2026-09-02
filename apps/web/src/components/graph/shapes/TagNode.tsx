import { ShapeWrapper, strokeProps } from "./shared";
import type { KaryaNodeData } from "../types";

export function TagNode({ data }: { data: KaryaNodeData }) {
  return (
    <ShapeWrapper data={data}>
      <polygon points="6,8 24,8 30,18 24,28 6,28" {...strokeProps} />
    </ShapeWrapper>
  );
}
