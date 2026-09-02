import type { EdgeRecord, NodeRecord } from "@karya/graph";

export type PromiseVerdict = "yes" | "yes_if" | "no";

export type PromiseQueryInput = {
  orgId: string;
  skuKey: string;
  qty: number;
  promiseDate?: string;
  excludeSalesOrderKey?: string;
};

export type PromiseBlocker = {
  kind: "stock" | "material" | "shipment" | "purchase_order";
  nodeKey: string;
  label: string;
  detail: string;
};

export type PromiseQueryResult = {
  verdict: PromiseVerdict;
  skuKey: string;
  skuLabel: string;
  qty: number;
  available: number;
  inbound: number;
  shortfall: number;
  blockers: PromiseBlocker[];
  summary: string;
};

function propNumber(
  props: NodeRecord["props"] | EdgeRecord["props"],
  key: string,
): number {
  const value = props[key];
  return typeof value === "number" ? value : 0;
}

function propString(
  props: NodeRecord["props"],
  key: string,
): string | null {
  const value = props[key];
  return typeof value === "string" ? value : null;
}

/**
 * Prospective inventory promise — mirrors stockPromiseRisk inbound walk,
 * but always counts open PO inbound (including delayed shipments) so the
 * Governor can answer "yes_if" when material is en route.
 */
export async function promiseQuery(
  input: PromiseQueryInput,
  loadGraph: () => Promise<{ nodes: NodeRecord[]; edges: EdgeRecord[] }>,
  getNodeByKey: (key: string) => Promise<NodeRecord | null>,
): Promise<PromiseQueryResult> {
  const sku = await getNodeByKey(input.skuKey);
  if (!sku || sku.type !== "SKU") {
    throw new PromiseSkuNotFoundError(input.skuKey);
  }

  const { nodes, edges } = await loadGraph();
  const nodeById = new Map(nodes.map((n) => [n._id, n]));

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

  if (input.excludeSalesOrderKey) {
    const so = nodes.find(
      (n) => n.key === input.excludeSalesOrderKey && n.type === "SalesOrder",
    );
    if (so) {
      const line = edges.find(
        (e) =>
          e.type === "ORDER_CONTAINS" &&
          e.fromId === so._id &&
          e.toId === sku._id,
      );
      if (line) {
        available += propNumber(line.props, "qty");
      }
    }
  }

  const materials = edges.filter(
    (e) => e.type === "MADE_FROM" && e.fromId === sku._id,
  );
  let inbound = 0;
  const blockers: PromiseBlocker[] = [];
  const seenBlockerKeys = new Set<string>();

  function pushBlocker(b: PromiseBlocker) {
    const id = `${b.kind}:${b.nodeKey}`;
    if (seenBlockerKeys.has(id)) return;
    seenBlockerKeys.add(id);
    blockers.push(b);
  }

  for (const matEdge of materials) {
    const materialId = matEdge.toId;
    const material = nodeById.get(materialId);
    const kgPerUnit = propNumber(matEdge.props, "qty");
    const poEdges = edges.filter(
      (e) =>
        e.type === "ORDER_CONTAINS" &&
        e.toId === materialId &&
        nodeById.get(e.fromId)?.type === "PurchaseOrder",
    );

    for (const poEdge of poEdges) {
      const po = nodeById.get(poEdge.fromId);
      if (!po) continue;
      const poStatus = propString(po.props, "status");
      if (poStatus === "received" || poStatus === "cancelled") continue;

      const poQty = propNumber(poEdge.props, "qty");
      const inboundSkuUnits = kgPerUnit > 0 ? poQty / kgPerUnit : poQty;
      const fulfillments = edges.filter(
        (e) => e.type === "FULFILLS" && e.toId === po._id,
      );

      if (fulfillments.length === 0) {
        inbound += inboundSkuUnits;
        if (poStatus === "late") {
          pushBlocker({
            kind: "purchase_order",
            nodeKey: po.key,
            label: po.label,
            detail: `${po.label} is late; ${Math.floor(inboundSkuUnits)}× ${sku.label} inbound pending.`,
          });
        }
        continue;
      }

      let counted = false;
      for (const f of fulfillments) {
        const shipment = nodeById.get(f.fromId);
        if (!shipment || shipment.type !== "Shipment") continue;
        const shipStatus = propString(shipment.props, "status");
        if (shipStatus === "received" || shipStatus === "delivered") continue;

        if (!counted) {
          inbound += inboundSkuUnits;
          counted = true;
        }

        if (shipStatus === "delayed" || poStatus === "late") {
          pushBlocker({
            kind: "purchase_order",
            nodeKey: po.key,
            label: po.label,
            detail: `${po.label} brass inbound is delayed; covers gap once received.`,
          });
        }
        if (shipStatus === "delayed") {
          pushBlocker({
            kind: "shipment",
            nodeKey: shipment.key,
            label: shipment.label,
            detail: `${shipment.label} is delayed.`,
          });
        }
        if (material) {
          pushBlocker({
            kind: "material",
            nodeKey: material.key,
            label: material.label,
            detail: `${material.label} inbound via ${po.label}.`,
          });
        }
      }
    }
  }

  const freeAfter = Math.max(0, available - input.qty);
  const shortfall = Math.max(0, input.qty - available - inbound);
  let verdict: PromiseVerdict;
  let summary: string;

  if (input.qty <= available) {
    verdict = "yes";
    summary = `${input.qty}× ${sku.label} available now (${freeAfter} free after existing reservations).`;
  } else if (input.qty <= available + inbound) {
    verdict = "yes_if";
    const poBlocker = blockers.find((b) => b.kind === "purchase_order");
    const blockerName = poBlocker?.label ?? "inbound material";
    summary = `${input.qty}× ${sku.label} needs inbound — ${available} on hand free, gap covered if ${blockerName} arrives.`;
  } else {
    verdict = "no";
    summary = `Cannot promise ${input.qty}× ${sku.label}: shortfall ${shortfall} after ${available} available and ${Math.floor(inbound)} inbound.`;
    if (available + inbound < input.qty) {
      pushBlocker({
        kind: "stock",
        nodeKey: sku.key,
        label: sku.label,
        detail: `Need ${input.qty}, have ${available} free + ${Math.floor(inbound)} inbound.`,
      });
    }
  }

  return {
    verdict,
    skuKey: sku.key,
    skuLabel: sku.label,
    qty: input.qty,
    available,
    inbound,
    shortfall,
    blockers,
    summary,
  };
}

export class PromiseSkuNotFoundError extends Error {
  constructor(public readonly skuKey: string) {
    super(`SKU not found: ${skuKey}`);
    this.name = "PromiseSkuNotFoundError";
  }
}
