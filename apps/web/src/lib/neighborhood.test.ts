import { describe, expect, it } from "vitest";
import {
  neighborhoodKeysFrom,
  neighborhoodPath,
  type Neighborhood,
} from "./neighborhood.js";

describe("neighborhoodKeysFrom", () => {
  it("includes center.key and all node keys from API shape", () => {
    const payload: Neighborhood = {
      center: {
        _id: "so218",
        type: "SalesOrder",
        key: "SalesOrder:SO-218",
        label: "SO-218",
      },
      nodes: [
        {
          _id: "sku1",
          type: "SKU",
          key: "SKU:Diya-Large",
          label: "Diya-Large",
        },
        {
          _id: "org1",
          type: "Org",
          key: "Org:Meenakshi-Brass",
          label: "Meenakshi Brass",
        },
      ],
      edges: [{ _id: "e1" }],
    };

    const keys = neighborhoodKeysFrom(payload);
    expect(keys.has("SalesOrder:SO-218")).toBe(true);
    expect(keys.has("SKU:Diya-Large")).toBe(true);
    expect(keys.has("Org:Meenakshi-Brass")).toBe(true);
    expect(keys.size).toBe(3);
  });

  it("returns empty set when center is missing", () => {
    expect(neighborhoodKeysFrom({ nodes: [], center: undefined as never })).toEqual(
      new Set(),
    );
    expect(neighborhoodKeysFrom(null)).toEqual(new Set());
  });
});

describe("neighborhoodPath", () => {
  it("encodes keys with colons", () => {
    expect(neighborhoodPath("SalesOrder:SO-218", 2)).toBe(
      "/v1/neighborhood?key=SalesOrder%3ASO-218&depth=2",
    );
  });
});
