import type { ComponentType } from "react";
import { CapsuleNode } from "./shapes/CapsuleNode";
import { CheckNode } from "./shapes/CheckNode";
import { ChevronLeftNode } from "./shapes/ChevronLeftNode";
import { ChevronRightNode } from "./shapes/ChevronRightNode";
import { CircleNode } from "./shapes/CircleNode";
import { ClockNode } from "./shapes/ClockNode";
import { DiamondNode } from "./shapes/DiamondNode";
import { DocumentNode } from "./shapes/DocumentNode";
import { DotNode } from "./shapes/DotNode";
import { FileNode } from "./shapes/FileNode";
import { HexagonNode } from "./shapes/HexagonNode";
import { PaymentDiscNode } from "./shapes/PaymentDiscNode";
import { PinNode } from "./shapes/PinNode";
import { QuoteNode } from "./shapes/QuoteNode";
import { RingNode } from "./shapes/RingNode";
import { RoundedSquareNode } from "./shapes/RoundedSquareNode";
import { ShieldNode } from "./shapes/ShieldNode";
import { SmallSquareNode } from "./shapes/SmallSquareNode";
import { TagNode } from "./shapes/TagNode";
import type { KaryaNodeData } from "./types";

export const NODE_SHAPE_ENTRIES: {
  type: string;
  Shape: ComponentType<{ data: KaryaNodeData }>;
}[] = [
  { type: "Person", Shape: CircleNode },
  { type: "Org", Shape: HexagonNode },
  { type: "SKU", Shape: RoundedSquareNode },
  { type: "Material", Shape: DiamondNode },
  { type: "Stock", Shape: SmallSquareNode },
  { type: "Location", Shape: PinNode },
  { type: "SalesOrder", Shape: ChevronRightNode },
  { type: "PurchaseOrder", Shape: ChevronLeftNode },
  { type: "Shipment", Shape: CapsuleNode },
  { type: "Invoice", Shape: DocumentNode },
  { type: "Payment", Shape: PaymentDiscNode },
  { type: "Lead", Shape: RingNode },
  { type: "Listing", Shape: TagNode },
  { type: "Meeting", Shape: ClockNode },
  { type: "Message", Shape: QuoteNode },
  { type: "Task", Shape: CheckNode },
  { type: "Policy", Shape: ShieldNode },
  { type: "Document", Shape: FileNode },
  { type: "Event", Shape: DotNode },
];

export const SHAPE_BY_TYPE: Record<string, ComponentType<{ data: KaryaNodeData }>> =
  Object.fromEntries(NODE_SHAPE_ENTRIES.map(({ type, Shape }) => [type, Shape]));

export function placeholderNodeData(nodeType: string): KaryaNodeData {
  return {
    nodeKey: nodeType,
    label: "",
    nodeType,
    selected: false,
    highlighted: false,
    exceptionSeverity: null,
  };
}
