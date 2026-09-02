import type { GraphStore, NodeRecord } from "@karya/graph";
import { addCalendarDays } from "./dates.js";
import type { CatalogItem, CatalogMerchant, CatalogResponse } from "./types.js";

function parseImages(sku: NodeRecord): string[] {
  const raw = sku.props.image_urls_json;
  if (typeof raw !== "string" || raw.length === 0) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

async function availableQtyForSku(
  store: GraphStore,
  orgId: string,
  sku: NodeRecord,
): Promise<number> {
  const hood = await store.neighborhood(orgId, sku._id, 1);
  let available = 0;
  for (const edge of hood.edges) {
    if (edge.type !== "STOCK_OF" || edge.toId !== sku._id || edge.validTo !== null) {
      continue;
    }
    const stock = hood.nodes.find((n) => n._id === edge.fromId);
    if (!stock || stock.type !== "Stock") {
      continue;
    }
    const onHand = Number(stock.props.on_hand ?? 0);
    const reserved = Number(stock.props.reserved ?? 0);
    available += Math.max(0, onHand - reserved);
  }
  return available;
}

async function resolveMerchant(
  store: GraphStore,
  orgId: string,
): Promise<CatalogMerchant> {
  const orgs = await store.listNodes(orgId, "Org");
  const byKey = orgs.find((o) => o.key === "Org:Arka-Atelier");
  const byRole = orgs.find((o) => o.props.role === "merchant");
  const merchant = byKey ?? byRole;
  if (!merchant) {
    return { name: "Merchant", orgId };
  }
  const city =
    typeof merchant.props.city === "string" ? merchant.props.city : undefined;
  const result: CatalogMerchant = {
    name: merchant.label,
    orgId,
  };
  if (city !== undefined) {
    result.city = city;
  }
  return result;
}

export async function buildCatalog(
  store: GraphStore,
  orgId: string,
): Promise<CatalogResponse> {
  const merchant = await resolveMerchant(store, orgId);
  const skus = await store.listNodes(orgId, "SKU");
  const now = new Date();
  const items: CatalogItem[] = [];

  for (const sku of skus) {
    const availableQty = await availableQtyForSku(store, orgId, sku);
    const leadDays = Number(sku.props.lead_days ?? 7);
    const priceInPaise = Number(sku.props.priceInPaise ?? 0);
    const gstRatePercent = Number(sku.props.gst ?? 0);
    const description =
      typeof sku.props.description === "string"
        ? sku.props.description
        : undefined;

    const item: CatalogItem = {
      skuKey: sku.key,
      name: sku.label,
      priceInPaise,
      currency: "INR",
      gstRatePercent,
      availableQty,
      leadDays,
      images: parseImages(sku),
      inStock: availableQty > 0,
      canShipBy: addCalendarDays(now, leadDays).toISOString(),
    };
    if (description !== undefined) {
      item.description = description;
    }
    items.push(item);
  }

  items.sort((a, b) => a.skuKey.localeCompare(b.skuKey));

  return {
    merchant,
    items,
    generatedAt: now.toISOString(),
  };
}
