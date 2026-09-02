import type { GraphStore } from "@karya/graph";

/**
 * Decrement reserved qty for a SKU's stock node (failure-recovery / cancel path).
 * Used by Step 7 money-agent failure recovery.
 */
export async function releaseReservation(
  store: GraphStore,
  orgId: string,
  skuKey: string,
  qty: number,
): Promise<void> {
  const stockNodes = await store.listNodes(orgId, "Stock");
  const stockNode = stockNodes.find((n) =>
    n.key.startsWith(`Stock:${skuKey.replace("SKU:", "")}`),
  );
  if (!stockNode) return;
  const currentReserved = (stockNode.props.reserved as number) ?? 0;
  const newReserved = Math.max(0, currentReserved - qty);
  await store.upsertNode({
    ...stockNode,
    props: { ...stockNode.props, reserved: newReserved },
  });
}
