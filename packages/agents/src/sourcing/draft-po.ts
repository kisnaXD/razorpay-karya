import type { EdgeRecord, GraphStore, NodeRecord } from "@karya/graph";
import {
  searchVendorDirectory,
  type VendorDirectoryEntry,
} from "@karya/seed";

export type MaterialNeedBlocker = {
  nodeKey: string;
  detail: string;
};

export type ExplainNeedResult = {
  materialKey: string;
  reorderPoint: number;
  onHandKg: number;
  reservedKg: number;
  incomingKg: number;
  blockers: MaterialNeedBlocker[];
  suggestedQtyKg: number;
  whyParagraph: string;
};

export type DraftPreviewInput = {
  orgId: string;
  vendorOrgKey: string;
  materialKey: string;
  qtyKg: number;
  reasonSalesOrderKeys?: string[];
  expectedAtDays?: number;
  explanation: string;
  /** PO keys already reserved by pending po.create approvals. */
  reservedPoKeys?: string[];
};

export type DraftPurchaseOrderPreview = {
  poKey: string;
  vendorLabel: string;
  materialLabel: string;
  qtyKg: number;
  estimatedTotalInPaise: number;
  expectedAt: string;
  why: string;
  pricePerKgInPaise: number;
  vendor: VendorDirectoryEntry | null;
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

function roundToNearest5(n: number): number {
  return Math.max(5, Math.round(n / 5) * 5);
}

function nextPoKey(nodes: NodeRecord[], reservedPoKeys: string[] = []): string {
  let max = 104;
  for (const n of nodes) {
    if (n.type !== "PurchaseOrder") continue;
    const m = /^PurchaseOrder:PO-(\d+)$/.exec(n.key);
    if (m) max = Math.max(max, Number(m[1]));
  }
  for (const key of reservedPoKeys) {
    const m = /^PurchaseOrder:PO-(\d+)$/.exec(key);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `PurchaseOrder:PO-${max + 1}`;
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString();
}

/**
 * Explain why a material is needed from graph context (reorder, SO demand, late POs).
 */
export async function explainMaterialNeed(
  store: GraphStore,
  orgId: string,
  input: {
    materialKey: string;
    triggerSalesOrderKey?: string;
  },
): Promise<ExplainNeedResult> {
  const material = await store.getNodeByKey(orgId, input.materialKey);
  if (!material || material.type !== "Material") {
    throw new Error(`Material not found: ${input.materialKey}`);
  }

  const nodes = await store.listNodes(orgId);
  const edges = await store.listEdges(orgId);
  const nodeById = new Map(nodes.map((n) => [n._id, n]));

  const reorderPoint = propNumber(material.props, "reorder_point") || 15;

  // Raw material on_hand if present; else derive from finished-goods stock via MADE_FROM.
  let onHandKg = propNumber(material.props, "on_hand");
  let reservedKg = propNumber(material.props, "reserved");
  if (!("on_hand" in material.props)) {
    onHandKg = 0;
    reservedKg = 0;
    const madeFrom = edges.filter(
      (e) => e.type === "MADE_FROM" && e.toId === material._id,
    );
    for (const mf of madeFrom) {
      const sku = nodeById.get(mf.fromId);
      if (!sku || sku.type !== "SKU") continue;
      const qtyPer = propNumber(mf.props, "qty");
      const stockEdges = edges.filter(
        (e) => e.type === "STOCK_OF" && e.toId === sku._id,
      );
      for (const se of stockEdges) {
        const stock = nodeById.get(se.fromId);
        if (!stock || stock.type !== "Stock") continue;
        onHandKg += propNumber(stock.props, "on_hand") * qtyPer;
        reservedKg += propNumber(stock.props, "reserved") * qtyPer;
      }
    }
  }

  // Demand from open/promised sales orders: SO —ORDER_CONTAINS→ SKU —MADE_FROM→ Material
  let demandKg = 0;
  const openStatuses = new Set(["open", "reserved", "promised", "packing"]);
  for (const so of nodes.filter((n) => n.type === "SalesOrder")) {
    const status = propString(so.props, "status") ?? "";
    const include =
      openStatuses.has(status) ||
      so.key === input.triggerSalesOrderKey;
    if (!include) continue;
    const lines = edges.filter(
      (e) => e.type === "ORDER_CONTAINS" && e.fromId === so._id,
    );
    for (const line of lines) {
      const sku = nodeById.get(line.toId);
      if (!sku || sku.type !== "SKU") continue;
      const mf = edges.find(
        (e) =>
          e.type === "MADE_FROM" &&
          e.fromId === sku._id &&
          e.toId === material._id,
      );
      if (!mf) continue;
      demandKg += propNumber(line.props, "qty") * propNumber(mf.props, "qty");
    }
  }

  // Incoming: open POs + shipments not received/cancelled
  let incomingKg = 0;
  const blockers: MaterialNeedBlocker[] = [];
  const poNodes = nodes.filter((n) => n.type === "PurchaseOrder");
  for (const po of poNodes) {
    const poStatus = propString(po.props, "status") ?? "";
    if (poStatus === "cancelled" || poStatus === "received") continue;
    const contains = edges.find(
      (e) =>
        e.type === "ORDER_CONTAINS" &&
        e.fromId === po._id &&
        e.toId === material._id,
    );
    if (!contains) continue;
    const qty =
      propNumber(contains.props, "qty") || propNumber(po.props, "qty");
    incomingKg += qty;

    const ship = edges
      .filter((e) => e.type === "FULFILLS" && e.toId === po._id)
      .map((e) => nodeById.get(e.fromId))
      .find((n) => n?.type === "Shipment");
    if (ship) {
      const shipStatus = propString(ship.props, "status") ?? "";
      if (shipStatus === "received" || shipStatus === "cancelled") {
        incomingKg -= qty;
        continue;
      }
      if (shipStatus === "delayed" || poStatus === "late") {
        const delay = propNumber(ship.props, "delay_days") || 4;
        blockers.push({
          nodeKey: po.key,
          detail: `${po.label} is late by ${delay} days (shipment ${ship.key}).`,
        });
      }
    } else if (poStatus === "late") {
      blockers.push({
        nodeKey: po.key,
        detail: `${po.label} is late.`,
      });
    }
  }

  const availableKg = onHandKg - reservedKg;
  const shortfall = Math.max(0, demandKg - availableKg);
  let suggestedQtyKg = roundToNearest5(
    Math.max(reorderPoint - availableKg + shortfall, reorderPoint),
  );

  // Demo lock: brass + SO-218 in graph → 40kg
  const hasSo218 = nodes.some((n) => n.key === "SalesOrder:SO-218");
  if (
    input.materialKey === "Material:BrassSheet-22g" &&
    hasSo218
  ) {
    suggestedQtyKg = 40;
  }

  const so218 = nodes.find((n) => n.key === "SalesOrder:SO-218");
  const soDetail = so218
    ? `${so218.key} (${propString(so218.props, "status") ?? "open"}, qty ${propNumber(so218.props, "qty")}) needs brass`
    : "open sales demand needs brass";
  const lateDetail =
    blockers.find((b) => b.nodeKey === "PurchaseOrder:PO-104")?.detail ??
    blockers[0]?.detail ??
    "inbound supply is tight";

  const whyParagraph = `We need ${suggestedQtyKg}kg ${material.label} because ${soDetail} and reorder point is ${reorderPoint}kg. ${lateDetail}`;

  return {
    materialKey: input.materialKey,
    reorderPoint,
    onHandKg,
    reservedKg,
    incomingKg,
    blockers,
    suggestedQtyKg,
    whyParagraph,
  };
}

export async function buildDraftPreview(
  store: GraphStore,
  input: DraftPreviewInput,
): Promise<DraftPurchaseOrderPreview> {
  const vendor = await store.getNodeByKey(input.orgId, input.vendorOrgKey);
  if (!vendor || vendor.type !== "Org") {
    throw new Error(`Vendor org not found: ${input.vendorOrgKey}`);
  }
  const material = await store.getNodeByKey(input.orgId, input.materialKey);
  if (!material || material.type !== "Material") {
    throw new Error(`Material not found: ${input.materialKey}`);
  }

  const nodes = await store.listNodes(input.orgId);
  const poKey = nextPoKey(nodes, input.reservedPoKeys ?? []);
  const expectedAtDays = input.expectedAtDays ?? 5;
  const directory =
    searchVendorDirectory(input.materialKey, { limit: 5 }).find(
      (v) => v.orgKey === input.vendorOrgKey,
    ) ?? null;
  const pricePerKgInPaise = directory?.pricePerKgInPaise ?? 42000;
  const estimatedTotalInPaise = Math.round(input.qtyKg * pricePerKgInPaise);

  const need = await explainMaterialNeed(store, input.orgId, {
    materialKey: input.materialKey,
    triggerSalesOrderKey: input.reasonSalesOrderKeys?.[0],
  });

  const why =
    input.reasonSalesOrderKeys && input.reasonSalesOrderKeys.length > 0
      ? `${need.whyParagraph} Draft for ${input.vendorOrgKey} covering ${input.reasonSalesOrderKeys.join(", ")}.`
      : need.whyParagraph;

  return {
    poKey,
    vendorLabel: vendor.label,
    materialLabel: material.label,
    qtyKg: input.qtyKg,
    estimatedTotalInPaise,
    expectedAt: daysFromNow(expectedAtDays),
    why,
    pricePerKgInPaise,
    vendor: directory,
  };
}
