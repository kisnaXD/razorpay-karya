import { ShapeWrapper, strokeProps } from "./shared";
import type { KaryaNodeData } from "../types";

export function CheckNode({ data }: { data: KaryaNodeData }) {
  return (
    <ShapeWrapper data={data}>
      <rect x={8} y={8} width={20} height={20} {...strokeProps} />
      <path
        d="M12 18 L16 22 L24 14"
        fill="none"
        stroke="var(--line)"
        strokeWidth={1.5}
      />
    </ShapeWrapper>
  );
}
