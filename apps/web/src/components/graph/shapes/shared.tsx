import type { ReactNode } from "react";
import type { KaryaNodeData } from "../types";

export type ShapeProps = {
  data: KaryaNodeData;
};

export function ShapeWrapper({
  children,
  data,
}: {
  children: ReactNode;
  data: KaryaNodeData;
}) {
  const exceptionClass =
    data.exceptionSeverity === "risk"
      ? "shape-exception-risk"
      : data.exceptionSeverity === "warn"
        ? "shape-exception-warn"
        : "";
  return (
    <svg
      width={36}
      height={36}
      viewBox="0 0 36 36"
      className={exceptionClass}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const strokeProps = {
  className: "shape-fill",
  fill: "transparent",
  stroke: "var(--line)",
  strokeWidth: 1.5,
};
