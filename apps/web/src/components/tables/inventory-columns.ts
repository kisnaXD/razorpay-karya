import type { GraphSnapshot } from "@/lib/graph-data";

export type InventoryRow = {
  key: string;
  kind: "SKU" | "Material" | "Stock";
  label: string;
  onHand: number | null;
  reserved: number | null;
  available: number | null;
  location: string | null;
  reorderFlag: boolean;
};

export function buildInventoryRows(snapshot: GraphSnapshot): InventoryRow[] {
  const rows: InventoryRow[] = [];
  const stockSkuIds = new Set<string>();

  for (const node of snapshot.nodes.filter((n) => n.type === "Stock")) {
    const onHand =
      typeof node.props.on_hand === "number" ? node.props.on_hand : null;
    const reserved =
      typeof node.props.reserved === "number" ? node.props.reserved : null;
    const available =
      onHand !== null && reserved !== null ? onHand - reserved : null;

    const stockOf = snapshot.edges.find(
      (e) => e.type === "STOCK_OF" && e.fromId === node._id,
    );
    const sku = stockOf ? snapshot.nodeById.get(stockOf.toId) : null;
    if (sku) stockSkuIds.add(sku._id);

    const locEdge = snapshot.edges.find(
      (e) => e.type === "LOCATED_AT" && e.fromId === node._id,
    );
    const loc = locEdge ? snapshot.nodeById.get(locEdge.toId) : null;

    rows.push({
      key: node.key,
      kind: "Stock",
      label: node.label,
      onHand,
      reserved,
      available,
      location: loc?.label ?? null,
      reorderFlag: false,
    });
  }

  for (const node of snapshot.nodes.filter((n) => n.type === "SKU")) {
    if (stockSkuIds.has(node._id)) continue;
    rows.push({
      key: node.key,
      kind: "SKU",
      label: node.label,
      onHand: null,
      reserved: null,
      available: null,
      location: null,
      reorderFlag: false,
    });
  }

  for (const node of snapshot.nodes.filter((n) => n.type === "Material")) {
    const reorderPoint =
      typeof node.props.reorder_point === "number"
        ? node.props.reorder_point
        : 0;
    if (reorderPoint <= 0) continue;

    const madeFromSkus = snapshot.edges
      .filter((e) => e.type === "MADE_FROM" && e.toId === node._id)
      .map((e) => snapshot.nodeById.get(e.fromId))
      .filter((n): n is NonNullable<typeof n> => n != null);

    let reorderFlag = false;
    if (madeFromSkus.length === 0) {
      reorderFlag = true;
    } else {
      for (const sku of madeFromSkus) {
        const stockEdge = snapshot.edges.find(
          (e) => e.type === "STOCK_OF" && e.toId === sku._id,
        );
        if (!stockEdge) {
          reorderFlag = true;
          break;
        }
        const stock = snapshot.nodeById.get(stockEdge.fromId);
        if (!stock) {
          reorderFlag = true;
          break;
        }
        const oh =
          typeof stock.props.on_hand === "number" ? stock.props.on_hand : 0;
        const res =
          typeof stock.props.reserved === "number" ? stock.props.reserved : 0;
        if (oh - res < reorderPoint) {
          reorderFlag = true;
          break;
        }
      }
    }

    rows.push({
      key: node.key,
      kind: "Material",
      label: node.label,
      onHand: null,
      reserved: null,
      available: null,
      location: null,
      reorderFlag,
    });
  }

  return rows;
}
