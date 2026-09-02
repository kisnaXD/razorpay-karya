export function formatInr(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(2)}L`;
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)}k`;
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** Exact rupee amount for ledger / money surfaces */
export function formatInrExact(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** @deprecated use formatInr */
export const formatCash = formatInr;

export function formatQty(n: number, uom?: string | null): string {
  const base = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return uom ? `${base} ${uom}` : base;
}

export type StatusTone = "teal" | "warn" | "risk" | "muted";

export function orderStatusTone(status: string | null | undefined): StatusTone {
  if (!status) return "muted";
  if (["paid", "received", "delivered", "shipped", "packed"].includes(status))
    return "teal";
  if (["late", "delayed", "overdue", "promised", "open"].includes(status))
    return "warn";
  if (["failed", "expired", "cancelled"].includes(status)) return "risk";
  return "muted";
}
