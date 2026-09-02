import { describe, expect, it } from "vitest";
import { searchVendorDirectory } from "@karya/seed";
import { searchVendors } from "./search.js";

describe("searchVendorDirectory / searchVendors", () => {
  it("searchVendorDirectory returns Meenakshi and Shree for brass sheet", () => {
    const hits = searchVendorDirectory("Material:BrassSheet-22g", {
      limit: 3,
      preferVerified: true,
    });
    const keys = hits.map((h) => h.orgKey);
    expect(keys).toContain("Org:Meenakshi-Brass");
    expect(keys).toContain("Org:Shree-Metal-Works");
    // Verified first, then cheaper of the verified pair first
    expect(hits[0]!.verified_bank).toBe(true);
    expect(hits[0]!.orgKey).toBe("Org:Shree-Metal-Works");
    expect(hits[1]!.orgKey).toBe("Org:Meenakshi-Brass");
  });

  it("searchVendors ranks directory hits", () => {
    const { vendors, source } = searchVendors("Material:BrassSheet-22g", {
      maxResults: 5,
    });
    expect(source).toBe("directory");
    expect(vendors.length).toBeGreaterThanOrEqual(2);
    expect(vendors[0]!.rank).toBe(1);
    expect(vendors.map((v) => v.orgKey)).toContain("Org:Jaipur-Alloys");
  });
});
