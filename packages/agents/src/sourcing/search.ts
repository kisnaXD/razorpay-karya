import {
  searchVendorDirectory,
  type VendorDirectoryEntry,
} from "@karya/seed";

export type VendorHit = VendorDirectoryEntry & {
  rank: number;
};

export function searchVendors(
  materialKey: string,
  opts?: { maxResults?: number; preferVerified?: boolean },
): { vendors: VendorHit[]; source: "directory" } {
  const entries = searchVendorDirectory(materialKey, {
    limit: opts?.maxResults ?? 3,
    preferVerified: opts?.preferVerified ?? true,
  });
  return {
    vendors: entries.map((v, i) => ({ ...v, rank: i + 1 })),
    source: "directory",
  };
}
