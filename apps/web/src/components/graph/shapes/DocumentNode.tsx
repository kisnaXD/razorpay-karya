import { ShapeWrapper, strokeProps } from "./shared";
import type { KaryaNodeData } from "../types";

export function DocumentNode({ data }: { data: KaryaNodeData }) {
  return (
    <ShapeWrapper data={data}>
      <path
        d="M10 6 H22 L26 10 V30 H10 Z"
        {...strokeProps}
      />
      <path d="M22 6 V10 H26" {...strokeProps} fill="none" />
    </ShapeWrapper>
  );
}
