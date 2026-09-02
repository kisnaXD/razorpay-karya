import type { GraphStore, NodeRecord } from "@karya/graph";

export async function findStockForSku(
  store: GraphStore,
  orgId: string,
  skuId: string,
): Promise<NodeRecord | null> {
  const sku = await store.getNode(orgId, skuId);
  if (!sku) {
    return null;
  }

  const preferredKey = `Stock:${sku.key.replace(/^SKU:/, "")}@Workshop`;
  const preferred = await store.getNodeByKey(orgId, preferredKey);
  if (preferred?.type === "Stock") {
    return preferred;
  }

  const hood = await store.neighborhood(orgId, skuId, 1);
  for (const edge of hood.edges) {
    if (edge.type !== "STOCK_OF" || edge.toId !== skuId || edge.validTo !== null) {
      continue;
    }
    const stock = hood.nodes.find((n) => n._id === edge.fromId);
    if (stock?.type === "Stock") {
      return stock;
    }
  }
  return null;
}
