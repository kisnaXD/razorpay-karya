import type { GraphStore, NodeRecord } from "@karya/graph";

export type FailureImpact = {
  payment: NodeRecord;
  invoice: NodeRecord | null;
  salesOrder: NodeRecord | null;
  buyerOrg: NodeRecord | null;
  stock: NodeRecord | null;
  sku: NodeRecord | null;
  lead: NodeRecord | null;
  promiseDate: string | null;
  reservedQty: number;
  amountInPaise: number;
};

function propNumber(
  props: NodeRecord["props"],
  key: string,
): number {
  const value = props[key];
  return typeof value === "number" ? value : 0;
}

function propString(
  props: NodeRecord["props"],
  key: string,
): string | null {
  const value = props[key];
  return typeof value === "string" ? value : null;
}

function formatInrFull(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export async function loadFailureImpact(
  store: GraphStore,
  orgId: string,
  paymentId: string,
): Promise<FailureImpact> {
  const payment = await store.getNode(orgId, paymentId);
  if (!payment || payment.type !== "Payment") {
    throw new Error(`Payment not found: ${paymentId}`);
  }

  const amountInPaise = propNumber(payment.props, "amountInPaise");
  let invoice: NodeRecord | null = null;
  let salesOrder: NodeRecord | null = null;
  let buyerOrg: NodeRecord | null = null;
  let sku: NodeRecord | null = null;
  let stock: NodeRecord | null = null;
  let lead: NodeRecord | null = null;

  const payHood = await store.neighborhood(orgId, paymentId, 1);
  const pays = payHood.edges.find(
    (e) =>
      e.type === "PAYS" && e.fromId === payment._id && e.validTo === null,
  );
  if (pays) {
    invoice =
      payHood.nodes.find((n) => n._id === pays.toId) ??
      (await store.getNode(orgId, pays.toId));
  }

  if (invoice) {
    const invHood = await store.neighborhood(orgId, invoice._id, 1);
    const invoices = invHood.edges.find(
      (e) =>
        e.type === "INVOICES" &&
        e.fromId === invoice!._id &&
        e.validTo === null,
    );
    if (invoices) {
      salesOrder =
        invHood.nodes.find((n) => n._id === invoices.toId) ??
        (await store.getNode(orgId, invoices.toId));
    }
  }

  if (salesOrder) {
    const soHood = await store.neighborhood(orgId, salesOrder._id, 1);
    const buys = soHood.edges.find(
      (e) =>
        e.type === "BUYS" &&
        e.toId === salesOrder!._id &&
        e.validTo === null,
    );
    if (buys) {
      buyerOrg =
        soHood.nodes.find((n) => n._id === buys.fromId) ??
        (await store.getNode(orgId, buys.fromId));
    }
    const line = soHood.edges.find(
      (e) =>
        e.type === "ORDER_CONTAINS" &&
        e.fromId === salesOrder!._id &&
        e.validTo === null,
    );
    if (line) {
      sku =
        soHood.nodes.find((n) => n._id === line.toId) ??
        (await store.getNode(orgId, line.toId));
    }
  }

  if (sku) {
    const skuHood = await store.neighborhood(orgId, sku._id, 1);
    const stockEdge = skuHood.edges.find(
      (e) =>
        e.type === "STOCK_OF" && e.toId === sku!._id && e.validTo === null,
    );
    if (stockEdge) {
      stock =
        skuHood.nodes.find((n) => n._id === stockEdge.fromId) ??
        (await store.getNode(orgId, stockEdge.fromId));
    }

    const listingEdge = skuHood.edges.find(
      (e) =>
        e.type === "LISTS" && e.toId === sku!._id && e.validTo === null,
    );
    if (listingEdge) {
      const listing =
        skuHood.nodes.find((n) => n._id === listingEdge.fromId) ??
        (await store.getNode(orgId, listingEdge.fromId));
      if (listing) {
        const listingHood = await store.neighborhood(orgId, listing._id, 1);
        const sourced = listingHood.edges.find(
          (e) =>
            e.type === "SOURCED_FROM" &&
            e.toId === listing._id &&
            e.validTo === null,
        );
        if (sourced) {
          lead =
            listingHood.nodes.find((n) => n._id === sourced.fromId) ??
            (await store.getNode(orgId, sourced.fromId));
        }
      }
    }
  }

  return {
    payment,
    invoice,
    salesOrder,
    buyerOrg,
    stock,
    sku,
    lead,
    promiseDate: salesOrder
      ? propString(salesOrder.props, "promise_date")
      : null,
    reservedQty: stock ? propNumber(stock.props, "reserved") : 0,
    amountInPaise,
  };
}

export function buildFailureImpactCopy(impact: FailureImpact): string {
  const buyer = impact.buyerOrg?.label ?? "Customer";
  const invoice = impact.invoice?.label ?? "invoice";
  const amount = formatInrFull(impact.amountInPaise);
  const so = impact.salesOrder?.label ?? "order";
  const sku = impact.sku?.label ?? "SKU";
  const promise = impact.promiseDate ?? "the promise date";
  const reserved = impact.reservedQty;
  const orderQty = impact.salesOrder
    ? propNumber(impact.salesOrder.props, "qty") || 8
    : 8;
  const lead = impact.lead?.label;

  let copy = `${buyer}'s Payment Link for ${invoice} (${amount}) expired. ${so}'s ${orderQty}× ${sku} promised ${promise} remain reserved (${reserved} units held at Workshop).`;
  if (lead) {
    copy += ` Lead ${lead} is waiting on the same SKU.`;
  }
  return copy;
}
