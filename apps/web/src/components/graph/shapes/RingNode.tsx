import { ShapeWrapper } from "./shared";
import type { KaryaNodeData } from "../types";

export function RingNode({ data }: { data: KaryaNodeData }) {
  return (
    <ShapeWrapper data={data}>
      <circle
        cx={18}
        cy={18}
        r={14}
        className="shape-fill"
        fill="transparent"
        stroke="var(--line)"
        strokeWidth={1.5}
      />
    </ShapeWrapper>
  );
}
