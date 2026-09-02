import type { GraphStore, NodeRecord } from "@karya/graph";

export type ListingDraftCopy = {
  title: string;
  bullets: string[];
  hashtags: string[];
};

export type ListingFacts = {
  sku: NodeRecord;
  materialLabel: string | null;
  priceInPaise: number;
  gstPercent: number;
  city: string;
};

function propNumber(
  props: NodeRecord["props"],
  key: string,
): number | null {
  const value = props[key];
  return typeof value === "number" ? value : null;
}

function propString(
  props: NodeRecord["props"],
  key: string,
): string | null {
  const value = props[key];
  return typeof value === "string" ? value : null;
}

function formatInr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function buildListingDraftCopy(facts: ListingFacts): ListingDraftCopy {
  const material = facts.materialLabel ?? "brass";
  const price = formatInr(facts.priceInPaise);
  const skuLabel = facts.sku.label;

  return {
    title: `Handcrafted ${skuLabel} — ${facts.city} brass`,
    bullets: [
      `Handcrafted large brass diya — ${facts.city} workshop`,
      `22g ${material.toLowerCase().includes("brass") ? "brass" : material} sheet, polished finish`,
      "Ships across India · GST included",
      `${price} · ${facts.gstPercent}% GST · ${skuLabel}`,
    ],
    hashtags: ["#BrassDiya", "#HandcraftedIndia", "#ArkaAtelier", `#${skuLabel.replace(/\s+/g, "")}`],
  };
}

export async function loadListingFacts(
  store: GraphStore,
  orgId: string,
  skuKey: string,
): Promise<ListingFacts> {
  const sku = await store.getNodeByKey(orgId, skuKey);
  if (!sku || sku.type !== "SKU") {
    throw new Error(`SKU not found: ${skuKey}`);
  }

  const hood = await store.neighborhood(orgId, sku._id, 1);
  const madeFrom = hood.edges.find(
    (e) => e.type === "MADE_FROM" && e.fromId === sku._id && e.validTo === null,
  );
  let materialLabel: string | null = null;
  if (madeFrom) {
    const material =
      hood.nodes.find((n) => n._id === madeFrom.toId) ??
      (await store.getNode(orgId, madeFrom.toId));
    materialLabel = material?.label ?? null;
  }

  const arka = await store.getNodeByKey(orgId, "Org:Arka-Atelier");
  const city = propString(arka?.props ?? {}, "city") ?? "Jaipur";

  return {
    sku,
    materialLabel,
    priceInPaise: propNumber(sku.props, "priceInPaise") ?? 0,
    gstPercent: propNumber(sku.props, "gst") ?? 12,
    city,
  };
}

export async function draftListingForSku(
  store: GraphStore,
  orgId: string,
  skuKey: string,
): Promise<ListingDraftCopy> {
  const facts = await loadListingFacts(store, orgId, skuKey);
  return buildListingDraftCopy(facts);
}
