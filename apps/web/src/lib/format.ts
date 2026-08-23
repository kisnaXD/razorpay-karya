/** Format paise as compact rupee label, e.g. 42000000 → ₹4.20L */
export function formatCash(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 100000) {
    const lakhs = rupees / 100000;
    return `₹${lakhs.toFixed(2)}L`;
  }
  if (rupees >= 1000) {
    const thousands = rupees / 1000;
    return `₹${thousands.toFixed(1)}K`;
  }
  return `₹${Math.round(rupees).toLocaleString("en-IN")}`;
}
