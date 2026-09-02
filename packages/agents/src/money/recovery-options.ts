import type { FailureImpact } from "./impact-copy.js";
import { buildFailureImpactCopy } from "./impact-copy.js";

export type RecoveryOption =
  | "retry_link"
  | "hold_stock_48h"
  | "release_to_lead";

export type RecoveryProposal = {
  option: RecoveryOption;
  paymentKey: string;
  invoiceKey: string;
  salesOrderKey: string;
  stockKey: string;
  leadKey: string;
  amountInPaise: number;
  impactSummary: string;
  impactNodeKeys: string[];
};

function formatInrFull(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function buildRecoveryProposals(
  impact: FailureImpact,
): RecoveryProposal[] {
  const invoiceKey = impact.invoice?.key ?? "";
  const invoiceLabel = impact.invoice?.label ?? "invoice";
  const salesOrderKey = impact.salesOrder?.key ?? "";
  const salesOrderLabel = impact.salesOrder?.label ?? "order";
  const stockKey = impact.stock?.key ?? "";
  const leadKey = impact.lead?.key ?? "";
  const leadLabel = impact.lead?.label ?? "lead";
  const skuLabel = impact.sku?.label ?? "SKU";
  const buyer = impact.buyerOrg?.label ?? "Customer";
  const amount = formatInrFull(impact.amountInPaise);
  const baseImpact = buildFailureImpactCopy(impact);

  const impactNodeKeys = [
    impact.payment.key,
    impact.invoice?.key,
    impact.salesOrder?.key,
    impact.stock?.key,
    impact.lead?.key,
  ].filter((k): k is string => Boolean(k));

  const base = {
    paymentKey: impact.payment.key,
    invoiceKey,
    salesOrderKey,
    stockKey,
    leadKey,
    amountInPaise: impact.amountInPaise,
    impactNodeKeys,
  };

  return [
    {
      ...base,
      option: "retry_link",
      impactSummary: `${baseImpact} Issuing a new link gives ${buyer} another chance to pay without releasing stock.`,
    },
    {
      ...base,
      option: "hold_stock_48h",
      impactSummary: `${baseImpact} Extend stock reservation on ${skuLabel} for ${salesOrderLabel} by 48 hours while collections retries.`,
    },
    {
      ...base,
      option: "release_to_lead",
      impactSummary: `${baseImpact} Release 1× ${skuLabel} reservation to fulfill Lead ${leadLabel} if ${buyer} does not pay by hold expiry.`,
    },
  ];
}

export function recoveryOptionExplanation(proposal: RecoveryProposal): string {
  const amount = formatInrFull(proposal.amountInPaise);
  const inv = proposal.invoiceKey.split(":")[1] ?? proposal.invoiceKey;
  switch (proposal.option) {
    case "retry_link":
      return `Issue a new Payment Link for ${inv} (${amount}). Same amount; new link idempotency key.`;
    case "hold_stock_48h":
      return `Extend stock reservation on ${proposal.stockKey} for ${proposal.salesOrderKey} by 48 hours while collections retries.`;
    case "release_to_lead": {
      const lead = proposal.leadKey.split(":")[1] ?? proposal.leadKey;
      return `Release 1× reservation to fulfill Lead ${lead} if payment does not clear by hold expiry.`;
    }
  }
}
