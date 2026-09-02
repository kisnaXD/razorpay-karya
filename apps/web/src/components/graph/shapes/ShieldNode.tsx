import { ShapeWrapper, strokeProps } from "./shared";
import type { KaryaNodeData } from "../types";

export function ShieldNode({ data }: { data: KaryaNodeData }) {
  return (
    <ShapeWrapper data={data}>
      <path
        d="M18 6 L28 10 V18 C28 24 18 30 18 30 C18 30 8 24 8 18 V10 Z"
        {...strokeProps}
      />
    </ShapeWrapper>
  );
}
