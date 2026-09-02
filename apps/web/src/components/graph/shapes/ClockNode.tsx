import { ShapeWrapper, strokeProps } from "./shared";
import type { KaryaNodeData } from "../types";

export function ClockNode({ data }: { data: KaryaNodeData }) {
  return (
    <ShapeWrapper data={data}>
      <circle cx={18} cy={18} r={14} {...strokeProps} />
      <path d="M18 18 V11" stroke="var(--line)" strokeWidth={1.5} />
      <path d="M18 18 H23" stroke="var(--line)" strokeWidth={1.5} />
    </ShapeWrapper>
  );
}
