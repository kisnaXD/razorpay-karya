import type { GraphStore, NodeRecord } from "@karya/graph";
import { newEdgeId, newNodeId } from "@karya/graph";
import {
  type RazorpayClient,
  type RazorpayPaymentLink,
  createPaymentLink,
  idempotencyKey,
} from "@karya/razorpay";
import { writeAuditEvent } from "./audit.js";

export type CreatePaymentLinkForInvoiceInput = {
  orgId: string;
  invoiceKey: string;
  idempotencyKey?: string;
  actor?: string;
};

export type CreatePaymentLinkForInvoiceResult = {
  paymentNode: NodeRecord;
  razorpay: RazorpayPaymentLink;
  created: boolean;
};

async function resolveCustomerName(
  store: GraphStore,
  orgId: string,
  invoice: NodeRecord,
): Promise<string> {
  const invoiceEdges = await findActiveEdgesFrom(store, orgId, invoice._id, "INVOICES");
  for (const invEdge of invoiceEdges) {
    const salesOrderId = invEdge.toId;
    const buyEdges = await findActiveEdgesTo(store, orgId, salesOrderId, "BUYS");
    for (const buyEdge of buyEdges) {
      const buyerOrg = await store.getNode(orgId, buyEdge.fromId);
      if (buyerOrg?.type === "Org") {
        return buyerOrg.label;
      }
    }
  }
  return "Customer";
}

async function findActiveEdgesFrom(
  store: GraphStore,
  orgId: string,
  fromId: string,
  type: "INVOICES",
) {
  const neighborhood = await store.neighborhood(orgId, fromId, 1);
  return neighborhood.edges.filter(
    (e) => e.type === type && e.fromId === fromId && e.validTo === null,
  );
}

async function findActiveEdgesTo(
  store: GraphStore,
  orgId: string,
  toId: string,
  type: "BUYS",
) {
  const neighborhood = await store.neighborhood(orgId, toId, 1);
  return neighborhood.edges.filter(
    (e) => e.type === type && e.toId === toId && e.validTo === null,
  );
}

function findPaymentByIdempotencyKey(
  payments: NodeRecord[],
  key: string,
): NodeRecord | undefined {
  return payments.find((p) => p.props.idempotency_key === key);
}

export async function createPaymentLinkForInvoice(
  store: GraphStore,
  client: RazorpayClient,
  audit: typeof writeAuditEvent,
  input: CreatePaymentLinkForInvoiceInput,
): Promise<CreatePaymentLinkForInvoiceResult> {
  const invoice = await store.getNodeByKey(input.orgId, input.invoiceKey);
  if (!invoice || invoice.type !== "Invoice") {
    throw new InvoiceNotFoundError(input.invoiceKey);
  }

  const amountRaw = invoice.props.amountInPaise;
  if (typeof amountRaw !== "number") {
    throw new Error(`Invoice ${input.invoiceKey} missing amountInPaise`);
  }

  const key =
    input.idempotencyKey ??
    idempotencyKey(input.orgId, "payment_link", input.invoiceKey);

  const existingPayments = await store.listNodes(input.orgId, "Payment");
  const existing = findPaymentByIdempotencyKey(existingPayments, key);
  if (existing) {
    const hood = await store.neighborhood(input.orgId, existing._id, 1);
    const hasPaysEdge = hood.edges.some(
      (e) =>
        e.type === "PAYS" &&
        e.fromId === existing._id &&
        e.toId === invoice._id &&
        e.validTo === null,
    );
    if (!hasPaysEdge) {
      await store.writeEdge({
        _id: newEdgeId(),
        orgId: input.orgId,
        type: "PAYS",
        fromId: existing._id,
        toId: invoice._id,
        props: {},
        validFrom: new Date(),
      });
    }

    const linkId = String(existing.props.razorpay_payment_link_id ?? "");
    const razorpay: RazorpayPaymentLink = {
      id: linkId,
      short_url: String(existing.props.short_url ?? ""),
      amount: Number(existing.props.amountInPaise ?? amountRaw),
      currency: "INR",
      status: mapPaymentStatus(String(existing.props.status ?? "sent")),
      created_at: 0,
    };
    return { paymentNode: existing, razorpay, created: false };
  }

  const customerName = await resolveCustomerName(store, input.orgId, invoice);

  const razorpay = await createPaymentLink(
    client,
    {
      amountInPaise: amountRaw,
      description: `Invoice ${invoice.label} — ${customerName}`,
      customer: { name: customerName },
      notes: {
        org_id: input.orgId,
        invoice_key: input.invoiceKey,
      },
    },
    key,
  );

  const paymentNode = await store.upsertNode({
    _id: newNodeId(),
    orgId: input.orgId,
    type: "Payment",
    key: `Payment:${razorpay.id}`,
    label: razorpay.id,
    props: {
      status: "sent",
      channel: "payment_link",
      amountInPaise: razorpay.amount,
      razorpay_payment_link_id: razorpay.id,
      short_url: razorpay.short_url,
      idempotency_key: key,
    },
  });

  await store.writeEdge({
    _id: newEdgeId(),
    orgId: input.orgId,
    type: "PAYS",
    fromId: paymentNode._id,
    toId: invoice._id,
    props: {},
    validFrom: new Date(),
  });

  await audit(store, {
    orgId: input.orgId,
    eventType: "payment_link.created",
    actor: input.actor ?? "system",
    sideEffectClass: "money",
    payload: {
      invoiceKey: input.invoiceKey,
      razorpayPaymentLinkId: razorpay.id,
      shortUrl: razorpay.short_url,
      amountInPaise: razorpay.amount,
    },
    aboutNodeIds: [paymentNode._id, invoice._id],
  });

  return { paymentNode, razorpay, created: true };
}

function mapPaymentStatus(
  status: string,
): RazorpayPaymentLink["status"] {
  if (
    status === "created" ||
    status === "paid" ||
    status === "partially_paid" ||
    status === "cancelled" ||
    status === "expired"
  ) {
    return status;
  }
  if (status === "sent" || status === "captured") {
    return status === "captured" ? "paid" : "created";
  }
  return "created";
}

export class InvoiceNotFoundError extends Error {
  constructor(invoiceKey: string) {
    super(`Invoice not found: ${invoiceKey}`);
    this.name = "InvoiceNotFoundError";
  }
}
