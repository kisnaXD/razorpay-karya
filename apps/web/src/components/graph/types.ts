import type { Node, NodeProps } from "@xyflow/react";

export type KaryaNodeData = {
  nodeKey: string;
  label: string;
  nodeType: string;
  selected: boolean;
  highlighted: boolean;
  exceptionSeverity?: "risk" | "warn" | null;
};

export type KaryaFlowNode = Node<KaryaNodeData, "karya">;
export type KaryaNodeProps = NodeProps<KaryaFlowNode>;
