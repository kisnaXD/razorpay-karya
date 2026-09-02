import type { CatalogItem, CheckoutLineItem, CheckoutSessionFulfillment, CheckoutTotals } from "./types.js";
import { addCalendarDays } from "./dates.js";

export function computeTotals(
  lines: CheckoutLineItem[],
  catalogItems: CatalogItem[],
): CheckoutTotals {
  const byKey = new Map(catalogItems.map((i) => [i.skuKey, i]));
  let subtotalInPaise = 0;
  let gstInPaise = 0;

  for (const line of lines) {
    const item = byKey.get(line.skuKey);
    if (!item) {
      continue;
    }
    const lineSubtotal = item.priceInPaise * line.quantity;
    const lineGst = Math.round((lineSubtotal * item.gstRatePercent) / 100);
    subtotalInPaise += lineSubtotal;
    gstInPaise += lineGst;
  }

  return {
    subtotalInPaise,
    gstInPaise,
    totalInPaise: subtotalInPaise + gstInPaise,
  };
}

export function validateLineItems(
  lines: CheckoutLineItem[],
  catalogItems: CatalogItem[],
):
  | { ok: true }
  | {
      ok: false;
      error: "sku_not_found" | "insufficient_stock";
      skuKey?: string;
    } {
  if (lines.length < 1) {
    return { ok: false, error: "sku_not_found" };
  }

  const byKey = new Map(catalogItems.map((i) => [i.skuKey, i]));

  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      return { ok: false, error: "sku_not_found", skuKey: line.skuKey };
    }
    const item = byKey.get(line.skuKey);
    if (!item) {
      return { ok: false, error: "sku_not_found", skuKey: line.skuKey };
    }
    if (line.quantity > item.availableQty) {
      return {
        ok: false,
        error: "insufficient_stock",
        skuKey: line.skuKey,
      };
    }
  }

  return { ok: true };
}

export function computeFulfillment(
  lines: CheckoutLineItem[],
  catalogItems: CatalogItem[],
): CheckoutSessionFulfillment {
  const byKey = new Map(catalogItems.map((i) => [i.skuKey, i]));
  let leadDaysMax = 0;
  for (const line of lines) {
    const item = byKey.get(line.skuKey);
    if (item) {
      leadDaysMax = Math.max(leadDaysMax, item.leadDays);
    }
  }
  if (leadDaysMax === 0) {
    leadDaysMax = 7;
  }
  return {
    type: "ship",
    estimatedShipDate: addCalendarDays(new Date(), leadDaysMax).toISOString(),
    leadDaysMax,
  };
}
