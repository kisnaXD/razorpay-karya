import type { EdgeRecord, Exception, NodeRecord } from "./types.js";
import { newExceptionId } from "./ids.js";
import { enrichExceptions } from "./inbox-enrichment.js";

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
    severity: "risk",
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
  // Only waiting links — expired/failed are covered by payment.failure
  const status = propString(node.props, "status");
  if (status !== "sent") {
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

type PaymentFailureImpact = {
  invoiceLabel: string | null;
  salesOrderLabel: string | null;
  buyerLabel: string | null;
  skuLabel: string | null;
  reservedQty: number;
  promiseDate: string | null;
  leadLabel: string | null;
  amountInPaise: number;
};

function walkPaymentFailureImpact(
  payment: NodeRecord,
  nodes: NodeRecord[],
  edges: EdgeRecord[],
): PaymentFailureImpact {
  const nodeById = new Map(nodes.map((n) => [n._id, n]));
  const amountInPaise = propNumber(payment.props, "amountInPaise");

  let invoice: NodeRecord | null = null;
  let salesOrder: NodeRecord | null = null;
  let buyer: NodeRecord | null = null;
  let sku: NodeRecord | null = null;
  let stock: NodeRecord | null = null;
  let lead: NodeRecord | null = null;

  const pays = edges.find(
    (e) =>
      e.type === "PAYS" && e.fromId === payment._id && e.validTo === null,
  );
  if (pays) {
    invoice = nodeById.get(pays.toId) ?? null;
  }

  if (invoice) {
    const invoices = edges.find(
      (e) =>
        e.type === "INVOICES" &&
        e.fromId === invoice!._id &&
        e.validTo === null,
    );
    if (invoices) {
      salesOrder = nodeById.get(invoices.toId) ?? null;
    }
  }

  if (salesOrder) {
    const buys = edges.find(
      (e) =>
        e.type === "BUYS" && e.toId === salesOrder!._id && e.validTo === null,
    );
    if (buys) {
      buyer = nodeById.get(buys.fromId) ?? null;
    }
    const line = edges.find(
      (e) =>
        e.type === "ORDER_CONTAINS" &&
        e.fromId === salesOrder!._id &&
        e.validTo === null,
    );
    if (line) {
      sku = nodeById.get(line.toId) ?? null;
    }
  }

  if (sku) {
    const stockEdge = edges.find(
      (e) =>
        e.type === "STOCK_OF" && e.toId === sku!._id && e.validTo === null,
    );
    if (stockEdge) {
      stock = nodeById.get(stockEdge.fromId) ?? null;
    }
    const listingEdge = edges.find(
      (e) => e.type === "LISTS" && e.toId === sku!._id && e.validTo === null,
    );
    if (listingEdge) {
      const listing = nodeById.get(listingEdge.fromId);
      if (listing) {
        const sourced = edges.find(
          (e) =>
            e.type === "SOURCED_FROM" &&
            e.toId === listing._id &&
            e.validTo === null,
        );
        if (sourced) {
          lead = nodeById.get(sourced.fromId) ?? null;
        }
      }
    }
  }

  return {
    invoiceLabel: invoice?.label ?? null,
    salesOrderLabel: salesOrder?.label ?? null,
    buyerLabel: buyer?.label ?? null,
    skuLabel: sku?.label ?? null,
    reservedQty: stock ? propNumber(stock.props, "reserved") : 0,
    promiseDate: salesOrder
      ? propString(salesOrder.props, "promise_date")
      : null,
    leadLabel: lead?.label ?? null,
    amountInPaise,
  };
}

function formatInrFull(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function buildShortFailureDetail(impact: PaymentFailureImpact): string {
  const amount =
    impact.amountInPaise > 0 ? formatInrFull(impact.amountInPaise) : null;
  const buyer = impact.buyerLabel ?? "Customer";
  const invoice = impact.invoiceLabel ?? "invoice";
  const so = impact.salesOrderLabel;
  const sku = impact.skuLabel ?? "SKU";
  const qty = impact.reservedQty;
  const promise = impact.promiseDate;
  const lead = impact.leadLabel;

  // Locked: detail must name SO / INV / lead when present for demo + tests.
  let detail = `${buyer}'s ${amount ? `${amount} ` : ""}link for ${invoice} expired`;
  if (so && promise) {
    detail += ` — ${so}'s ${qty}× ${sku} still reserved for ${promise}`;
  } else if (so) {
    detail += ` — ${so} stock still reserved`;
  }
  if (lead) {
    detail += `; ${lead} is next in line`;
  }
  detail += ".";
  return detail;
}

function paymentFailure(
  node: NodeRecord,
  nodes: NodeRecord[],
  edges: EdgeRecord[],
): Exception | null {
  if (node.type !== "Payment") {
    return null;
  }
  const status = propString(node.props, "status");
  if (status !== "expired" && status !== "failed") {
    return null;
  }

  const impact = walkPaymentFailureImpact(node, nodes, edges);
  const detail = buildShortFailureDetail(impact);

  return {
    id: newExceptionId("payment.failure", node._id),
    severity: "risk",
    code: "payment.failure",
    nodeId: node._id,
    title: `${node.label} ${status}`,
    detail,
  };
}

function collectionsEscalated(node: NodeRecord): Exception | null {
  if (node.type !== "Invoice") {
    return null;
  }
  const status = propString(node.props, "status");
  if (status === "paid" || status === "void") {
    return null;
  }
  const nudgeCount = propNumber(node.props, "nudge_count");
  if (nudgeCount < 3) {
    return null;
  }

  return {
    id: newExceptionId("collections.escalated", node._id),
    severity: "risk",
    code: "collections.escalated",
    nodeId: node._id,
    title: `${node.label} — collections escalated`,
    detail:
      "Three payment nudges sent; manual follow-up required before another link.",
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
        const kgPerUnit = propNumber(matEdge.props, "qty");
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
          const inboundSkuUnits =
            kgPerUnit > 0 ? poQty / kgPerUnit : poQty;
          const fulfillments = edges.filter(
            (e) => e.type === "FULFILLS" && e.toId === po._id,
          );

          if (fulfillments.length === 0) {
            inbound += inboundSkuUnits;
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
            if (shipStatus === "delayed") {
              blockingPo = po;
              blockingShipment = shipment;
              continue;
            }
            if (!poInboundCounted) {
              inbound += inboundSkuUnits;
              poInboundCounted = true;
            }
            blockingPo = po;
            blockingShipment = shipment;
          }
        }
      }

      if (promisedQty > available + inbound) {
        const skuName = sku.label;
        const buyerEdge = edges.find(
          (e) => e.type === "BUYS" && e.toId === so._id,
        );
        const buyer = buyerEdge ? nodeById.get(buyerEdge.fromId) : undefined;
        const promiseDate = propString(so.props, "promise_date");

        let detail: string;
        if (buyer && blockingPo && promiseDate) {
          detail = `${buyer.label}'s ${promisedQty}× ${skuName} promised ${promiseDate} is blocked by late brass on ${blockingPo.label}.`;
        } else {
          detail = `${so.label}'s ${promisedQty}× ${skuName} cannot be fulfilled with ${available} available`;
          if (blockingPo) {
            detail += ` and is blocked by late material on ${blockingPo.label}`;
            if (blockingShipment) {
              detail += ` (${blockingShipment.label} delayed)`;
            }
          }
          detail += ".";
        }

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
      paymentFailure(node, nodes, edges),
      collectionsEscalated(node),
    ];
    for (const ex of checks) {
      if (ex) {
        results.push(ex);
      }
    }
  }

  results.push(...stockPromiseRisk(nodes, edges));

  const nodeById = new Map(nodes.map((n) => [n._id, n]));
  const withKeys = results.map((ex) => ({
    ...ex,
    nodeKey: nodeById.get(ex.nodeId)?.key ?? ex.nodeId,
  }));
  return enrichExceptions(withKeys);
}
