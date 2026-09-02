export type VendorDirectoryEntry = {
  orgKey: string;
  label: string;
  city: string;
  materialKeys: string[];
  pricePerKgInPaise: number;
  leadDays: number;
  verified_bank: boolean;
  notes: string;
};

export const VENDOR_DIRECTORY: VendorDirectoryEntry[] = [
  {
    orgKey: "Org:Meenakshi-Brass",
    label: "Meenakshi Brass",
    city: "Moradabad",
    materialKeys: ["Material:BrassSheet-22g"],
    pricePerKgInPaise: 42000,
    leadDays: 5,
    verified_bank: true,
    notes: "Existing seed vendor; PO-104 open",
  },
  {
    orgKey: "Org:Shree-Metal-Works",
    label: "Shree Metal Works",
    city: "Aligarh",
    materialKeys: ["Material:BrassSheet-22g"],
    pricePerKgInPaise: 40500,
    leadDays: 7,
    verified_bank: true,
    notes: "Alternate brass sheet supplier",
  },
  {
    orgKey: "Org:Jaipur-Alloys",
    label: "Jaipur Alloys",
    city: "Jaipur",
    materialKeys: ["Material:BrassSheet-22g"],
    pricePerKgInPaise: 43800,
    leadDays: 3,
    verified_bank: false,
    notes: "Local; not verified for payout",
  },
];

export function searchVendorDirectory(
  materialKey: string,
  opts?: { limit?: number; preferVerified?: boolean },
): VendorDirectoryEntry[] {
  const limit = Math.min(Math.max(opts?.limit ?? 3, 1), 5);
  const preferVerified = opts?.preferVerified ?? true;

  let matches = VENDOR_DIRECTORY.filter((v) =>
    v.materialKeys.includes(materialKey),
  );

  if (preferVerified) {
    const verified = matches.filter((v) => v.verified_bank);
    if (verified.length > 0) {
      // Keep unverified after verified; do not drop them entirely.
      matches = [
        ...verified,
        ...matches.filter((v) => !v.verified_bank),
      ];
    }
  }

  matches = [...matches].sort((a, b) => {
    if (preferVerified && a.verified_bank !== b.verified_bank) {
      return a.verified_bank ? -1 : 1;
    }
    if (a.pricePerKgInPaise !== b.pricePerKgInPaise) {
      return a.pricePerKgInPaise - b.pricePerKgInPaise;
    }
    return a.leadDays - b.leadDays;
  });

  return matches.slice(0, limit);
}
