import { ShapeWrapper, strokeProps } from "./shared";
import type { KaryaNodeData } from "../types";

export function PinNode({ data }: { data: KaryaNodeData }) {
  return (
    <ShapeWrapper data={data}>
      <path
        d="M18 6 C22 6 25 9 25 13 C25 18 18 28 18 28 C18 28 11 18 11 13 C11 9 14 6 18 6 Z"
        {...strokeProps}
      />
    </ShapeWrapper>
  );
}
