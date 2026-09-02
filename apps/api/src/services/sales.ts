import { ulid } from "ulid";
import type { GraphStore, NodeRecord } from "@karya/graph";
import { newEdgeId, newNodeId } from "@karya/graph";
import type { PromiseQueryResult } from "@karya/agents";
import { runPromiseQuery } from "./inventory.js";
import type { writeAuditEvent } from "./audit.js";

export type OrderBookRow = {
  key: string;
  label: string;
  status: string;
  customerOrgKey: string | null;
  customerLabel: string | null;
  promiseDate: string | null;
  lines: Array<{ skuKey: string; skuLabel: string; qty: number }>;
  invoiceKey: string | null;
  amountInPaise: number | null;
};

export type QuoteResult = {
  skuKey: string;
  qty: number;
  unitPriceInPaise: number;
  subtotalInPaise: number;
  gstRate: number;
  gstInPaise: number;
  totalInPaise: number;
  materials: Array<{ materialKey: string; qtyPerUnit: number; uom: string }>;
};

function propNumber(
  props: Record<string, string | number | boolean | null>,
  key: string,
): number {
  const value = props[key];
  return typeof value === "number" ? value : 0;
}

function propString(
  props: Record<string, string | number | boolean | null>,
  key: string,
): string | null {
  const value = props[key];
  return typeof value === "string" ? value : null;
}

export class PromiseRejectedError extends Error {
  constructor(public readonly promiseResult: PromiseQueryResult) {
    super(promiseResult.summary);
    this.name = "PromiseRejectedError";
  }
}

export class SalesOrderNotFoundError extends Error {
  constructor(key: string) {
    super(`Sales order not found: ${key}`);
    this.name = "SalesOrderNotFoundError";
  }
}

export async function getOrderBook(
  store: GraphStore,
  orgId: string,
  filter?: { status?: string },
): Promise<OrderBookRow[]> {
  const orders = await store.listNodes(orgId, "SalesOrder");
  const edges = await store.listEdges(orgId);
  const nodes = await store.listNodes(orgId);
  const nodeById = new Map(nodes.map((n) => [n._id, n]));

  const rows: OrderBookRow[] = [];

  for (const so of orders) {
    const status = propString(so.props, "status") ?? "open";
    if (filter?.status && status !== filter.status) continue;

    const buyEdge = edges.find((e) => e.type === "BUYS" && e.toId === so._id);
    const customer = buyEdge ? nodeById.get(buyEdge.fromId) : undefined;

    const lineEdges = edges.filter(
      (e) => e.type === "ORDER_CONTAINS" && e.fromId === so._id,
    );
    const lines = lineEdges
      .map((e) => {
        const sku = nodeById.get(e.toId);
        if (!sku || sku.type !== "SKU") return null;
        return {
          skuKey: sku.key,
          skuLabel: sku.label,
          qty: propNumber(e.props, "qty"),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const invoiceEdge = edges.find(
      (e) => e.type === "INVOICES" && e.toId === so._id,
    );
    const invoice = invoiceEdge ? nodeById.get(invoiceEdge.fromId) : undefined;

    rows.push({
      key: so.key,
      label: so.label,
      status,
      customerOrgKey: customer?.key ?? null,
      customerLabel: customer?.label ?? null,
      promiseDate: propString(so.props, "promise_date"),
      lines,
      invoiceKey: invoice?.key ?? null,
      amountInPaise: invoice
        ? propNumber(invoice.props, "amountInPaise")
        : null,
    });
  }

  rows.sort((a, b) => a.key.localeCompare(b.key));
  return rows;
}

export async function generateQuote(
  store: GraphStore,
  orgId: string,
  input: { skuKey: string; qty: number; customerOrgKey?: string },
): Promise<QuoteResult> {
  const sku = await store.getNodeByKey(orgId, input.skuKey);
  if (!sku || sku.type !== "SKU") {
    throw new Error(`SKU not found: ${input.skuKey}`);
  }

  const unitPriceInPaise = propNumber(sku.props, "priceInPaise");
  const gstRate = propNumber(sku.props, "gst") || 12;
  const subtotalInPaise = unitPriceInPaise * input.qty;
  const gstInPaise = Math.round((subtotalInPaise * gstRate) / 100);

  const edges = await store.listEdges(orgId);
  const nodes = await store.listNodes(orgId);
  const nodeById = new Map(nodes.map((n) => [n._id, n]));
  const materials = edges
    .filter((e) => e.type === "MADE_FROM" && e.fromId === sku._id)
    .map((e) => {
      const mat = nodeById.get(e.toId);
      return {
        materialKey: mat?.key ?? e.toId,
        qtyPerUnit: propNumber(e.props, "qty"),
        uom: propString(e.props, "uom") ?? "kg",
      };
    });

  return {
    skuKey: sku.key,
    qty: input.qty,
    unitPriceInPaise,
    subtotalInPaise,
    gstRate,
    gstInPaise,
    totalInPaise: subtotalInPaise + gstInPaise,
    materials,
  };
}

export async function acceptSalesOrder(
  store: GraphStore,
  orgId: string,
  audit: typeof writeAuditEvent,
  input: {
    customerOrgKey: string;
    skuKey: string;
    qty: number;
    promiseDate: string;
    actor: string;
  },
): Promise<{
  salesOrder: NodeRecord;
  promiseResult: PromiseQueryResult;
}> {
  const promiseResult = await runPromiseQuery(store, orgId, {
    skuKey: input.skuKey,
    qty: input.qty,
    promiseDate: input.promiseDate,
  });

  if (promiseResult.verdict === "no") {
    throw new PromiseRejectedError(promiseResult);
  }

  const customer = await store.getNodeByKey(orgId, input.customerOrgKey);
  if (!customer || customer.type !== "Org") {
    throw new Error(`Customer org not found: ${input.customerOrgKey}`);
  }

  const sku = await store.getNodeByKey(orgId, input.skuKey);
  if (!sku || sku.type !== "SKU") {
    throw new Error(`SKU not found: ${input.skuKey}`);
  }

  const soKey = `SalesOrder:SO-${ulid()}`;
  const salesOrder = await store.upsertNode({
    _id: newNodeId(),
    orgId,
    type: "SalesOrder",
    key: soKey,
    label: soKey.split(":")[1]!,
    props: {
      status: "promised",
      promise_date: input.promiseDate,
      channel: "agent",
      qty: input.qty,
    },
  });

  await store.writeEdge({
    _id: newEdgeId(),
    orgId,
    type: "BUYS",
    fromId: customer._id,
    toId: salesOrder._id,
    props: {},
    validFrom: new Date(),
  });

  await store.writeEdge({
    _id: newEdgeId(),
    orgId,
    type: "ORDER_CONTAINS",
    fromId: salesOrder._id,
    toId: sku._id,
    props: { qty: input.qty },
    validFrom: new Date(),
  });

  // MVP: increment reserved on the first Stock node for SKU only (not proportional).
  const edges = await store.listEdges(orgId);
  const stockEdge = edges.find(
    (e) => e.type === "STOCK_OF" && e.toId === sku._id,
  );
  let stockNode: NodeRecord | null = null;
  if (stockEdge) {
    stockNode = await store.getNode(orgId, stockEdge.fromId);
    if (stockNode?.type === "Stock") {
      const onHand = propNumber(stockNode.props, "on_hand");
      const currentReserved = propNumber(stockNode.props, "reserved");
      const available = onHand - currentReserved;
      if (available < input.qty) {
        throw new Error(
          `Insufficient stock: ${available} available, ${input.qty} requested`,
        );
      }
      const reserved = currentReserved + input.qty;
      stockNode = await store.upsertNode({
        ...stockNode,
        props: { ...stockNode.props, reserved },
      });
    }
  }

  await audit(store, {
    orgId,
    eventType: "sales.order_accepted",
    actor: input.actor,
    sideEffectClass: "write",
    payload: {
      salesOrderKey: salesOrder.key,
      skuKey: sku.key,
      qty: input.qty,
      promiseResult,
      stockKey: stockNode?.key ?? null,
    },
    aboutNodeIds: [salesOrder._id, sku._id, ...(stockNode ? [stockNode._id] : [])],
  });

  return { salesOrder, promiseResult };
}

export async function rejectSalesOrder(
  store: GraphStore,
  orgId: string,
  audit: typeof writeAuditEvent,
  input: { salesOrderKey: string; reason: string; actor: string },
): Promise<NodeRecord> {
  const so = await store.getNodeByKey(orgId, input.salesOrderKey);
  if (!so || so.type !== "SalesOrder") {
    throw new SalesOrderNotFoundError(input.salesOrderKey);
  }

  const edges = await store.listEdges(orgId);
  const nodes = await store.listNodes(orgId);
  const nodeById = new Map(nodes.map((n) => [n._id, n]));

  const lineEdges = edges.filter(
    (e) => e.type === "ORDER_CONTAINS" && e.fromId === so._id,
  );

  for (const line of lineEdges) {
    const sku = nodeById.get(line.toId);
    if (!sku || sku.type !== "SKU") continue;
    const qty = propNumber(line.props, "qty");
    const stockEdge = edges.find(
      (e) => e.type === "STOCK_OF" && e.toId === sku._id,
    );
    if (!stockEdge) continue;
    const stock = nodeById.get(stockEdge.fromId);
    if (!stock || stock.type !== "Stock") continue;
    const reserved = Math.max(0, propNumber(stock.props, "reserved") - qty);
    await store.upsertNode({
      ...stock,
      props: { ...stock.props, reserved },
    });
  }

  const updated = await store.upsertNode({
    ...so,
    props: {
      ...so.props,
      status: "cancelled",
      reject_reason: input.reason,
    },
  });

  await audit(store, {
    orgId,
    eventType: "sales.order_rejected",
    actor: input.actor,
    sideEffectClass: "write",
    payload: {
      salesOrderKey: so.key,
      reason: input.reason,
    },
    aboutNodeIds: [so._id],
  });

  return updated;
}
