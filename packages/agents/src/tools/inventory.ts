import type { ToolContext } from "../types.js";

function propNumber(
  props: Record<string, string | number | boolean | null>,
  key: string,
): number {
  const value = props[key];
  return typeof value === "number" ? value : 0;
}

export async function inventoryPromiseQueryTool(
  ctx: ToolContext,
  input: {
    skuKey: string;
    qty: number;
    promiseDate?: string;
  },
) {
  return ctx.promiseQuery({
    skuKey: input.skuKey,
    qty: input.qty,
    ...(input.promiseDate !== undefined
      ? { promiseDate: input.promiseDate }
      : {}),
  });
}

export async function inventoryCheckStock(
  ctx: ToolContext,
  input: { skuKey: string },
) {
  const sku = await ctx.store.getNodeByKey(ctx.orgId, input.skuKey);
  if (!sku || sku.type !== "SKU") {
    throw new Error(`SKU not found: ${input.skuKey}`);
  }

  const hood = await ctx.store.neighborhood(ctx.orgId, sku._id, 1);
  const stockNodes = hood.nodes.filter((n) => n.type === "Stock");
  const stockOfEdges = hood.edges.filter(
    (e) => e.type === "STOCK_OF" && e.toId === sku._id,
  );
  const linked = stockNodes.filter((s) =>
    stockOfEdges.some((e) => e.fromId === s._id),
  );

  let onHand = 0;
  let reserved = 0;
  for (const stock of linked) {
    onHand += propNumber(stock.props, "on_hand");
    reserved += propNumber(stock.props, "reserved");
  }

  return {
    skuKey: sku.key,
    onHand,
    reserved,
    available: onHand - reserved,
    stockNodeKeys: linked.map((s) => s.key),
  };
}
