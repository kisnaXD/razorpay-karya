"use client";

import { useState } from "react";
import { DotNode } from "./shapes/DotNode";
import { SHAPE_BY_TYPE } from "./node-shapes";
import type { KaryaNodeProps } from "./types";
import type { NodeTypes } from "@xyflow/react";

export type { KaryaNodeData } from "./types";

export function KaryaNode(props: KaryaNodeProps) {
  const [hovered, setHovered] = useState(false);
  const Shape = SHAPE_BY_TYPE[props.data.nodeType] ?? DotNode;
  const showTooltip = hovered && !props.dragging;

  return (
    <div
      className={[
        "karya-node",
        props.data.exceptionSeverity ? "exception-pulse" : "",
      ].join(" ")}
      data-selected={props.data.selected}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Shape data={props.data} />
      <div className="karya-node-label">{props.data.label}</div>
      {showTooltip ? (
        <div
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-[var(--radius-sm)] border border-line bg-surface-2 px-2 py-1 text-[11px]"
          role="tooltip"
        >
          <div className="text-text">{props.data.label}</div>
          <div className="text-muted">{props.data.nodeType}</div>
          <div className="font-mono text-muted">{props.data.nodeKey}</div>
          <span
            aria-hidden
            className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-line"
          />
        </div>
      ) : null}
    </div>
  );
}

export const karyaNodeTypes: NodeTypes = { karya: KaryaNode };
