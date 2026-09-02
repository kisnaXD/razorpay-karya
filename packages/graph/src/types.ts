import type { Db } from "mongodb";

export const NODE_TYPES = [
  "Person",
  "Org",
  "SKU",
  "Material",
  "Stock",
  "Location",
  "SalesOrder",
  "PurchaseOrder",
  "Shipment",
  "Invoice",
  "Payment",
  "Lead",
  "Listing",
  "Meeting",
  "Message",
  "Task",
  "Policy",
  "Document",
  "Event",
] as const;

export const EDGE_TYPES = [
  "OWNS",
  "EMPLOYS",
  "CONTACT_AT",
  "SUPPLIES",
  "BUYS",
  "HAS_SKU",
  "MADE_FROM",
  "STOCK_OF",
  "LOCATED_AT",
  "ORDER_CONTAINS",
  "FULFILLS",
  "SHIPS",
  "INVOICES",
  "PAYS",
  "PAYS_OUT",
  "ABOUT",
  "FOLLOW_UP",
  "SOURCED_FROM",
  "LISTS",
  "GOVERNED_BY",
  "SUPERSEDES",
  "CAUSED",
] as const;

export type NodeType = (typeof NODE_TYPES)[number];
export type EdgeType = (typeof EDGE_TYPES)[number];

export type NodeRecord = {
  _id: string;
  orgId: string;
  type: NodeType;
  key: string;
  label: string;
  props: Record<string, string | number | boolean | null>;
  createdAt: Date;
  updatedAt: Date;
};

export type EdgeRecord = {
  _id: string;
  orgId: string;
  type: EdgeType;
  fromId: string;
  toId: string;
  props: Record<string, string | number | boolean | null>;
  validFrom: Date;
  validTo: Date | null;
  createdAt: Date;
};

export type GraphFilter = { at?: Date };

export type ExceptionSeverity = "risk" | "warn";

export type InboxAction = {
  id: string;
  label: string;
  kind: "agent_prompt" | "navigate";
  payload: {
    message?: string;
    nodeKey?: string;
  };
};

export type Exception = {
  id: string;
  severity: ExceptionSeverity;
  code:
    | "stock.promise_risk"
    | "shipment.delayed"
    | "invoice.overdue"
    | "payment.uncollected"
    | "payment.failure"
    | "collections.escalated"
    | "po.late";
  nodeId: string;
  title: string;
  detail: string;
  /** Graph node key when known (e.g. Invoice:INV-104). */
  nodeKey?: string;
  why?: string;
  recommendation?: string;
  actions?: InboxAction[];
  domain?: "finance" | "procurement" | "sales" | "inventory";
  priority?: "critical" | "high" | "medium" | "low";
};

export type { Db };
