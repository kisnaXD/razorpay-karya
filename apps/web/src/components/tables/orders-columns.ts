import type { GraphSnapshot } from "@/lib/graph-data";
import { formatInr } from "@/lib/format";

export type OrderRow = {
  key: string;
  orderType: "SalesOrder" | "PurchaseOrder";
  label: string;
  status: string;
  counterparty: string | null;
  dateLabel: string | null;
  amountLabel: string | null;
  amountPaise: number | null;
};

const RISK_STATUSES = new Set(["late", "overdue", "promised"]);

export function buildOrderRows(snapshot: GraphSnapshot): OrderRow[] {
  const rows: OrderRow[] = [];

  for (const node of snapshot.nodes) {
    if (node.type !== "SalesOrder" && node.type !== "PurchaseOrder") continue;

    const status = String(node.props.status ?? "");
    let counterparty: string | null = null;
    let dateLabel: string | null = null;
    let amountLabel: string | null = null;
    let amountPaise: number | null = null;

    if (node.type === "SalesOrder") {
      const buysEdge = snapshot.edges.find(
        (e) => e.type === "BUYS" && e.toId === node._id,
      );
      if (buysEdge) {
        counterparty = snapshot.nodeById.get(buysEdge.fromId)?.label ?? null;
      }
      if (node.props.promise_date) {
        dateLabel = String(node.props.promise_date);
      }
      const invEdge = snapshot.edges.find(
        (e) => e.type === "INVOICES" && e.toId === node._id,
      );
      if (invEdge) {
        const inv = snapshot.nodeById.get(invEdge.fromId);
        const amount = inv?.props.amountInPaise;
        if (typeof amount === "number") {
          amountPaise = amount;
          amountLabel = formatInr(amount);
        }
      }
    } else {
      if (node.props.expectedAt) {
        const d = new Date(String(node.props.expectedAt));
        dateLabel = Number.isNaN(d.getTime())
          ? String(node.props.expectedAt)
          : d.toLocaleDateString("en-IN");
      }
      const containsEdge = snapshot.edges.find(
        (e) => e.type === "ORDER_CONTAINS" && e.fromId === node._id,
      );
      if (containsEdge) {
        const suppliesEdge = snapshot.edges.find(
          (e) => e.type === "SUPPLIES" && e.toId === containsEdge.toId,
        );
        if (suppliesEdge) {
          counterparty =
            snapshot.nodeById.get(suppliesEdge.fromId)?.label ?? null;
        }
      }
    }

    rows.push({
      key: node.key,
      orderType: node.type,
      label: node.label,
      status,
      counterparty,
      dateLabel,
      amountLabel,
      amountPaise,
    });
  }

  rows.sort((a, b) => {
    const aRisk = RISK_STATUSES.has(a.status) ? 0 : 1;
    const bRisk = RISK_STATUSES.has(b.status) ? 0 : 1;
    if (aRisk !== bRisk) return aRisk - bRisk;
    return a.key.localeCompare(b.key);
  });

  return rows;
}
