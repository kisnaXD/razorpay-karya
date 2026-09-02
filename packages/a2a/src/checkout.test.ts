import { describe, expect, it } from "vitest";
import type { CatalogItem, CheckoutLineItem } from "./types.js";
import {
  computeFulfillment,
  computeTotals,
  validateLineItems,
} from "./checkout.js";

const diya: CatalogItem = {
  skuKey: "SKU:Diya-Large",
  name: "Diya-Large",
  priceInPaise: 185000,
  currency: "INR",
  gstRatePercent: 12,
  availableQty: 3,
  leadDays: 5,
  images: [],
  inStock: true,
  canShipBy: new Date().toISOString(),
};

const tray: CatalogItem = {
  skuKey: "SKU:Tray-Oval",
  name: "Tray-Oval",
  priceInPaise: 240000,
  currency: "INR",
  gstRatePercent: 0,
  availableQty: 20,
  leadDays: 7,
  images: [],
  inStock: true,
  canShipBy: new Date().toISOString(),
};

const catalog = [diya, tray];

describe("computeTotals", () => {
  it("Diya-Large qty 1: subtotal 185000, gst 22200, total 207200", () => {
    const lines: CheckoutLineItem[] = [
      { skuKey: "SKU:Diya-Large", quantity: 1 },
    ];
    const totals = computeTotals(lines, catalog);
    expect(totals).toEqual({
      subtotalInPaise: 185000,
      gstInPaise: 22200,
      totalInPaise: 207200,
    });
  });
});

describe("validateLineItems", () => {
  it("request qty 4 when available 3 → insufficient_stock", () => {
    const result = validateLineItems(
      [{ skuKey: "SKU:Diya-Large", quantity: 4 }],
      catalog,
    );
    expect(result).toEqual({
      ok: false,
      error: "insufficient_stock",
      skuKey: "SKU:Diya-Large",
    });
  });

  it("unknown sku → sku_not_found", () => {
    const result = validateLineItems(
      [{ skuKey: "SKU:Missing", quantity: 1 }],
      catalog,
    );
    expect(result).toEqual({
      ok: false,
      error: "sku_not_found",
      skuKey: "SKU:Missing",
    });
  });

  it("valid lines → ok", () => {
    const result = validateLineItems(
      [{ skuKey: "SKU:Diya-Large", quantity: 1 }],
      catalog,
    );
    expect(result).toEqual({ ok: true });
  });
});

describe("computeFulfillment", () => {
  it("uses max lead days across lines", () => {
    const fulfillment = computeFulfillment(
      [
        { skuKey: "SKU:Diya-Large", quantity: 1 },
        { skuKey: "SKU:Tray-Oval", quantity: 1 },
      ],
      catalog,
    );
    expect(fulfillment.type).toBe("ship");
    expect(fulfillment.leadDaysMax).toBe(7);
    expect(typeof fulfillment.estimatedShipDate).toBe("string");
  });
});
