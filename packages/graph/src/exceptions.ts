import type { EdgeRecord, Exception, NodeRecord } from "./types.js";
import { newExceptionId } from "./ids.js";

function propString(props: NodeRecord["props"], key: string): string | null {
  const value = props[key];
  return typeof value === "string" ? value : null;
}

function propNumber(props: NodeRecord["props"], key: string): number {
  const value = props[key];
  return typeof value === "number" ? value : 0;
}

function parseDate(
  value: string | number | boolean | null | undefined,
): Date | null {
  if (typeof value !== "string") {
    return null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function invoiceOverdue(node: NodeRecord, now: Date): Exception | null {
  if (node.type !== "Invoice") {
    return null;
  }
  const status = propString(node.props, "status");
  const dueAt = parseDate(node.props.dueAt ?? null);
  const overdue =
    status === "overdue" ||
    (dueAt !== null &&
      dueAt < now &&
      status !== "paid" &&
      status !== "void");

  if (!overdue) {
    return null;
  }

  return {
    id: newExceptionId("invoice.overdue", node._id),
    severity: "warn",
    code: "invoice.overdue",
    nodeId: node._id,
    title: `${node.label} is overdue`,
    detail: `Payment for ${node.label} is past due and still outstanding.`,
  };
}

function shipmentDelayed(node: NodeRecord, now: Date): Exception | null {
  if (node.type !== "Shipment") {
    return null;
  }
  const status = propString(node.props, "status");
  const expectedAt = parseDate(node.props.expectedAt ?? null);
  const delayed =
    status === "delayed" ||
    (expectedAt !== null &&
      expectedAt < now &&
      status !== "received" &&
      status !== "delivered");

  if (!delayed) {
    return null;
  }

  return {
    id: newExceptionId("shipment.delayed", node._id),
    severity: "warn",
    code: "shipment.delayed",
    nodeId: node._id,
    title: `${node.label} is delayed`,
    detail: `${node.label} has not arrived on schedule and downstream orders may slip.`,
  };
}

function poLate(node: NodeRecord, now: Date): Exception | null {
  if (node.type !== "PurchaseOrder") {
    return null;
  }
  const status = propString(node.props, "status");
  const expectedAt = parseDate(node.props.expectedAt ?? null);
  const late =
    status === "late" ||
    (expectedAt !== null &&
      expectedAt < now &&
      status !== "received" &&
      status !== "cancelled");

  if (!late) {
    return null;
  }

  return {
    id: newExceptionId("po.late", node._id),
    severity: "warn",
    code: "po.late",
    nodeId: node._id,
    title: `${node.label} is late`,
    detail: `${node.label} is past its expected date and material may not arrive in time.`,
  };
}

function paymentUncollected(node: NodeRecord): Exception | null {
  if (node.type !== "Payment") {
    return null;
  }
  const status = propString(node.props, "status");
  if (status !== "sent" && status !== "expired" && status !== "failed") {
    return null;
  }

  return {
    id: newExceptionId("payment.uncollected", node._id),
    severity: "warn",
    code: "payment.uncollected",
    nodeId: node._id,
    title: `${node.label} not collected`,
    detail: `Payment ${node.label} was sent but has not been collected.`,
  };
}

function stockPromiseRisk(
  nodes: NodeRecord[],
  edges: EdgeRecord[],
): Exception[] {
  const salesOrders = nodes.filter(
    (n) =>
      n.type === "SalesOrder" &&
      (n.props.status === "open" || n.props.status === "promised"),
  );
  const nodeById = new Map(nodes.map((n) => [n._id, n]));
  const results: Exception[] = [];

  for (const so of salesOrders) {
    const lines = edges.filter(
      (e) => e.type === "ORDER_CONTAINS" && e.fromId === so._id,
    );

    for (const line of lines) {
      const sku = nodeById.get(line.toId);
      if (!sku || sku.type !== "SKU") {
        continue;
      }

      const promisedQty = propNumber(line.props, "qty");
      const stockEdges = edges.filter(
        (e) => e.type === "STOCK_OF" && e.toId === sku._id,
      );
      let available = 0;
      for (const se of stockEdges) {
        const stock = nodeById.get(se.fromId);
        if (stock?.type === "Stock") {
          available +=
            propNumber(stock.props, "on_hand") -
            propNumber(stock.props, "reserved");
        }
      }

      const materials = edges.filter(
        (e) => e.type === "MADE_FROM" && e.fromId === sku._id,
      );
      let inbound = 0;
      let blockingPo: NodeRecord | undefined;
      let blockingShipment: NodeRecord | undefined;

      for (const matEdge of materials) {
        const materialId = matEdge.toId;
        const poEdges = edges.filter(
          (e) =>
            e.type === "ORDER_CONTAINS" &&
            e.toId === materialId &&
            nodeById.get(e.fromId)?.type === "PurchaseOrder",
        );

        for (const poEdge of poEdges) {
          const po = nodeById.get(poEdge.fromId);
          if (!po) {
            continue;
          }
          const poStatus = propString(po.props, "status");
          if (poStatus === "received" || poStatus === "cancelled") {
            continue;
          }

          const poQty = propNumber(poEdge.props, "qty");
          const fulfillments = edges.filter(
            (e) => e.type === "FULFILLS" && e.toId === po._id,
          );

          if (fulfillments.length === 0) {
            inbound += poQty;
            blockingPo = po;
            continue;
          }

          let poInboundCounted = false;
          for (const f of fulfillments) {
            const shipment = nodeById.get(f.fromId);
            if (!shipment || shipment.type !== "Shipment") {
              continue;
            }
            const shipStatus = propString(shipment.props, "status");
            if (shipStatus === "received" || shipStatus === "delivered") {
              continue;
            }
            if (!poInboundCounted) {
              inbound += poQty;
              poInboundCounted = true;
            }
            blockingPo = po;
            blockingShipment = shipment;
          }
        }
      }

      if (promisedQty > available + inbound) {
        const skuName = sku.label;
        let detail = `${so.label}'s ${promisedQty}× ${skuName} cannot be fulfilled with ${available} available`;
        if (blockingPo) {
          detail += ` and is blocked by late material on ${blockingPo.label}`;
          if (blockingShipment) {
            detail += ` (${blockingShipment.label} delayed)`;
          }
        }
        detail += ".";

        results.push({
          id: newExceptionId("stock.promise_risk", `${so._id}_${sku._id}`),
          severity: "risk",
          code: "stock.promise_risk",
          nodeId: so._id,
          title: `Promise risk on ${so.label}`,
          detail,
        });
      }
    }
  }

  return results;
}

export function evaluateExceptions(
  nodes: NodeRecord[],
  edges: EdgeRecord[],
): Exception[] {
  const now = new Date();
  const results: Exception[] = [];

  for (const node of nodes) {
    const checks = [
      invoiceOverdue(node, now),
      shipmentDelayed(node, now),
      poLate(node, now),
      paymentUncollected(node),
    ];
    for (const ex of checks) {
      if (ex) {
        results.push(ex);
      }
    }
  }

  results.push(...stockPromiseRisk(nodes, edges));
  return results;
}
