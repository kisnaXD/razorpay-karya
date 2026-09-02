import type { ApiEdge, ApiNodeFull } from "@/lib/api";
import type { GraphSnapshot } from "@/lib/graph-data";

export type ItemCategory = "Raw Materials" | "Finished Goods";

export type CatalogItem = {
  key: string;
  name: string;
  type: "SKU" | "Material";
  category: ItemCategory;
  unit: string;
  onHand: number | null;
  reserved: number | null;
  available: number | null;
  reorderPoint: number | null;
  location: string | null;
  priceInPaise: number | null;
  lowStock: boolean;
};

export type StockHealth = "healthy" | "near" | "below";

export type StockLevelRow = {
  key: string;
  itemKey: string;
  itemLabel: string;
  warehouse: string;
  onHand: number;
  reserved: number;
  available: number;
  reorderPoint: number | null;
  health: StockHealth;
  valueInPaise: number | null;
};

export type MovementType = "In" | "Out";

export type StockMovementRow = {
  id: string;
  date: string | null;
  itemKey: string;
  itemLabel: string;
  type: MovementType;
  qty: number;
  reference: string;
  warehouse: string | null;
};

function propNumber(
  props: ApiNodeFull["props"],
  key: string,
): number | null {
  const v = props[key];
  return typeof v === "number" ? v : null;
}

function propString(
  props: ApiNodeFull["props"],
  key: string,
): string | null {
  const v = props[key];
  return typeof v === "string" ? v : null;
}

function nodeCreatedAt(node: ApiNodeFull): string | null {
  const raw = (node as { createdAt?: unknown }).createdAt;
  if (typeof raw === "string") return raw;
  if (raw instanceof Date) return raw.toISOString();
  return null;
}

function stocksForSku(
  snapshot: GraphSnapshot,
  skuId: string,
): ApiNodeFull[] {
  return snapshot.edges
    .filter((e) => e.type === "STOCK_OF" && e.toId === skuId)
    .map((e) => snapshot.nodeById.get(e.fromId))
    .filter((n): n is ApiNodeFull => n != null && n.type === "Stock");
}

function locationForStock(
  snapshot: GraphSnapshot,
  stockId: string,
): string | null {
  const locEdge = snapshot.edges.find(
    (e) => e.type === "LOCATED_AT" && e.fromId === stockId,
  );
  if (!locEdge) return null;
  return snapshot.nodeById.get(locEdge.toId)?.label ?? null;
}

function aggregateStock(stocks: ApiNodeFull[]): {
  onHand: number | null;
  reserved: number | null;
  available: number | null;
  location: string | null;
} {
  if (stocks.length === 0) {
    return { onHand: null, reserved: null, available: null, location: null };
  }
  let onHand = 0;
  let reserved = 0;
  let location: string | null = null;
  for (const stock of stocks) {
    onHand += propNumber(stock.props, "on_hand") ?? 0;
    reserved += propNumber(stock.props, "reserved") ?? 0;
  }
  return {
    onHand,
    reserved,
    available: onHand - reserved,
    location,
  };
}

function materialReorderFlag(
  snapshot: GraphSnapshot,
  material: ApiNodeFull,
  reorderPoint: number,
): boolean {
  const madeFromSkus = snapshot.edges
    .filter((e) => e.type === "MADE_FROM" && e.toId === material._id)
    .map((e) => snapshot.nodeById.get(e.fromId))
    .filter((n): n is ApiNodeFull => n != null);

  if (madeFromSkus.length === 0) return true;

  for (const sku of madeFromSkus) {
    const stocks = stocksForSku(snapshot, sku._id);
    if (stocks.length === 0) return true;
    const { available } = aggregateStock(stocks);
    if (available === null || available < reorderPoint) return true;
  }
  return false;
}

export function stockHealth(
  available: number,
  reorderPoint: number | null,
  reserved = 0,
): StockHealth {
  if (reorderPoint !== null && reorderPoint > 0) {
    if (available < reorderPoint) return "below";
    if (available < reorderPoint * 1.5) return "near";
    return "healthy";
  }
  if (available <= 0) return "below";
  if (reserved > 0 && available < reserved) return "near";
  return "healthy";
}

export function buildCatalogItems(snapshot: GraphSnapshot): CatalogItem[] {
  const items: CatalogItem[] = [];

  for (const node of snapshot.nodes.filter((n) => n.type === "SKU")) {
    const stocks = stocksForSku(snapshot, node._id);
    const agg = aggregateStock(stocks);
    if (stocks[0]) {
      agg.location = locationForStock(snapshot, stocks[0]._id);
    }
    const reorderPoint = propNumber(node.props, "reorder_point");
    const available = agg.available;
    const lowStock =
      (available !== null &&
        reorderPoint !== null &&
        available < reorderPoint) ||
      (available !== null && available <= 0) ||
      (available !== null &&
        agg.reserved !== null &&
        available < agg.reserved);

    items.push({
      key: node.key,
      name: node.label,
      type: "SKU",
      category: "Finished Goods",
      unit: propString(node.props, "uom") ?? "ea",
      onHand: agg.onHand,
      reserved: agg.reserved,
      available,
      reorderPoint,
      location: agg.location,
      priceInPaise: propNumber(node.props, "priceInPaise"),
      lowStock,
    });
  }

  for (const node of snapshot.nodes.filter((n) => n.type === "Material")) {
    const onHand = propNumber(node.props, "on_hand");
    const reserved = propNumber(node.props, "reserved");
    const available =
      onHand !== null && reserved !== null
        ? onHand - reserved
        : onHand !== null
          ? onHand
          : null;
    const reorderPoint = propNumber(node.props, "reorder_point");
    const lowStock =
      available !== null && reorderPoint !== null
        ? available < reorderPoint
        : reorderPoint !== null &&
          reorderPoint > 0 &&
          materialReorderFlag(snapshot, node, reorderPoint);

    items.push({
      key: node.key,
      name: node.label,
      type: "Material",
      category: "Raw Materials",
      unit: propString(node.props, "uom") ?? "kg",
      onHand,
      reserved,
      available,
      reorderPoint,
      location: null,
      priceInPaise: propNumber(node.props, "priceInPaise"),
      lowStock,
    });
  }

  return items;
}

export function buildStockLevelRows(snapshot: GraphSnapshot): StockLevelRow[] {
  const rows: StockLevelRow[] = [];

  for (const stock of snapshot.nodes.filter((n) => n.type === "Stock")) {
    const stockOf = snapshot.edges.find(
      (e) => e.type === "STOCK_OF" && e.fromId === stock._id,
    );
    const item = stockOf ? snapshot.nodeById.get(stockOf.toId) : null;
    const onHand = propNumber(stock.props, "on_hand") ?? 0;
    const reserved = propNumber(stock.props, "reserved") ?? 0;
    const available = onHand - reserved;
    const reorderPoint =
      propNumber(stock.props, "reorder_point") ??
      (item ? propNumber(item.props, "reorder_point") : null);
    const priceInPaise = item ? propNumber(item.props, "priceInPaise") : null;

    rows.push({
      key: stock.key,
      itemKey: item?.key ?? stock.key,
      itemLabel: item?.label ?? stock.label,
      warehouse: locationForStock(snapshot, stock._id) ?? "—",
      onHand,
      reserved,
      available,
      reorderPoint,
      health: stockHealth(available, reorderPoint, reserved),
      valueInPaise:
        priceInPaise !== null ? priceInPaise * Math.max(available, 0) : null,
    });
  }

  rows.sort((a, b) => a.available - b.available);
  return rows;
}

function edgeQty(edge: ApiEdge): number {
  const q = edge.props.qty;
  return typeof q === "number" ? q : 0;
}

function posWithShipment(snapshot: GraphSnapshot): Set<string> {
  const ids = new Set<string>();
  for (const e of snapshot.edges) {
    if (e.type !== "FULFILLS") continue;
    const ship = snapshot.nodeById.get(e.fromId);
    const po = snapshot.nodeById.get(e.toId);
    if (ship?.type === "Shipment" && po?.type === "PurchaseOrder") {
      ids.add(po._id);
    }
  }
  return ids;
}

export function buildStockMovements(snapshot: GraphSnapshot): StockMovementRow[] {
  const rows: StockMovementRow[] = [];
  const coveredPos = posWithShipment(snapshot);
  const defaultWarehouse =
    snapshot.nodes.find((n) => n.type === "Location")?.label ?? null;

  for (const ship of snapshot.nodes.filter((n) => n.type === "Shipment")) {
    const fulfills = snapshot.edges.find(
      (e) => e.type === "FULFILLS" && e.fromId === ship._id,
    );
    const po = fulfills ? snapshot.nodeById.get(fulfills.toId) : null;
    const direction = propString(ship.props, "direction");
    const type: MovementType =
      direction === "outbound" ? "Out" : "In";

    if (po?.type === "PurchaseOrder") {
      const lines = snapshot.edges.filter(
        (e) => e.type === "ORDER_CONTAINS" && e.fromId === po._id,
      );
      for (const line of lines) {
        const item = snapshot.nodeById.get(line.toId);
        if (!item) continue;
        rows.push({
          id: `${ship.key}:${item.key}`,
          date:
            propString(po.props, "expectedAt") ??
            nodeCreatedAt(ship) ??
            nodeCreatedAt(po),
          itemKey: item.key,
          itemLabel: item.label,
          type,
          qty: edgeQty(line) || propNumber(po.props, "qty") || 0,
          reference: `${ship.label} · ${po.label}`,
          warehouse: defaultWarehouse,
        });
      }
      if (lines.length === 0) {
        rows.push({
          id: ship.key,
          date:
            propString(po.props, "expectedAt") ??
            nodeCreatedAt(ship) ??
            nodeCreatedAt(po),
          itemKey: po.key,
          itemLabel: po.label,
          type,
          qty: propNumber(po.props, "qty") ?? 0,
          reference: `${ship.label} · ${po.label}`,
          warehouse: defaultWarehouse,
        });
      }
    } else {
      rows.push({
        id: ship.key,
        date: nodeCreatedAt(ship),
        itemKey: ship.key,
        itemLabel: ship.label,
        type,
        qty: 0,
        reference: ship.label,
        warehouse: defaultWarehouse,
      });
    }
  }

  for (const e of snapshot.edges.filter((e) => e.type === "SHIPS")) {
    const from = snapshot.nodeById.get(e.fromId);
    const to = snapshot.nodeById.get(e.toId);
    const item =
      to?.type === "SKU" || to?.type === "Material"
        ? to
        : from?.type === "SKU" || from?.type === "Material"
          ? from
          : null;
    if (!item) continue;
    rows.push({
      id: e._id,
      date: nodeCreatedAt(from ?? to!),
      itemKey: item.key,
      itemLabel: item.label,
      type: "Out",
      qty: edgeQty(e),
      reference: from?.label ?? to?.label ?? "Shipment",
      warehouse: defaultWarehouse,
    });
  }

  for (const so of snapshot.nodes.filter((n) => n.type === "SalesOrder")) {
    const lines = snapshot.edges.filter(
      (e) => e.type === "ORDER_CONTAINS" && e.fromId === so._id,
    );
    for (const line of lines) {
      const item = snapshot.nodeById.get(line.toId);
      if (!item) continue;
      rows.push({
        id: `${so.key}:${item.key}`,
        date:
          propString(so.props, "promise_date") ?? nodeCreatedAt(so),
        itemKey: item.key,
        itemLabel: item.label,
        type: "Out",
        qty: edgeQty(line) || propNumber(so.props, "qty") || 0,
        reference: so.label,
        warehouse: defaultWarehouse,
      });
    }
  }

  for (const po of snapshot.nodes.filter((n) => n.type === "PurchaseOrder")) {
    if (coveredPos.has(po._id)) continue;
    const lines = snapshot.edges.filter(
      (e) => e.type === "ORDER_CONTAINS" && e.fromId === po._id,
    );
    for (const line of lines) {
      const item = snapshot.nodeById.get(line.toId);
      if (!item) continue;
      rows.push({
        id: `${po.key}:${item.key}`,
        date: propString(po.props, "expectedAt") ?? nodeCreatedAt(po),
        itemKey: item.key,
        itemLabel: item.label,
        type: "In",
        qty: edgeQty(line) || propNumber(po.props, "qty") || 0,
        reference: po.label,
        warehouse: defaultWarehouse,
      });
    }
  }

  rows.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  return rows;
}
