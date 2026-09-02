import type { ToolContext } from "../types.js";

export async function salesGetOrderBook(
  ctx: ToolContext,
  input: { status?: string },
) {
  return {
    orders: await ctx.getOrderBook(
      input.status ? { status: input.status } : undefined,
    ),
  };
}

export async function salesGenerateQuote(
  ctx: ToolContext,
  input: { skuKey: string; qty: number; customerOrgKey?: string },
) {
  const quote = await ctx.generateQuote({
    skuKey: input.skuKey,
    qty: input.qty,
    ...(input.customerOrgKey !== undefined
      ? { customerOrgKey: input.customerOrgKey }
      : {}),
  });
  return {
    lineItems: [
      {
        skuKey: quote.skuKey,
        qty: quote.qty,
        unitPriceInPaise: quote.unitPriceInPaise,
        lineTotalInPaise: quote.subtotalInPaise,
      },
    ],
    subtotalInPaise: quote.subtotalInPaise,
    gstInPaise: quote.gstInPaise,
    totalInPaise: quote.totalInPaise,
    marginNote: `GST ${quote.gstRate}% included in total.`,
    materials: quote.materials,
  };
}

export async function salesAcceptOrder(
  ctx: ToolContext,
  input: {
    customerOrgKey: string;
    skuKey: string;
    qty: number;
    promiseDate: string;
    explanation: string;
  },
) {
  const result = await ctx.acceptSalesOrder({
    customerOrgKey: input.customerOrgKey,
    skuKey: input.skuKey,
    qty: input.qty,
    promiseDate: input.promiseDate,
    actor: "agent:governor",
  });
  return {
    salesOrderKey: result.salesOrder.key,
    reservedQty: input.qty,
    promiseQuery: result.promiseResult,
  };
}

export async function salesRejectOrder(
  ctx: ToolContext,
  input: { salesOrderKey: string; reason: string },
) {
  const salesOrder = await ctx.rejectSalesOrder({
    salesOrderKey: input.salesOrderKey,
    reason: input.reason,
    actor: "agent:governor",
  });
  return {
    salesOrderKey: salesOrder.key,
    status: salesOrder.status,
  };
}
