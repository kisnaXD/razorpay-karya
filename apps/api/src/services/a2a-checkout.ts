import { ulid } from "ulid";
import type { Db } from "mongodb";
import {
  buildCatalog,
  computeFulfillment,
  computeTotals,
  findStockForSku,
  validateLineItems,
  type A2AOrderResponse,
  type A2ASessionDocument,
  type CheckoutSession,
  type CompleteCheckoutSessionResponse,
  type CreateCheckoutSessionRequest,
} from "@karya/a2a";
import { newEdgeId, newNodeId, type GraphStore } from "@karya/graph";
import {
  createPaymentLink,
  idempotencyKey,
  type RazorpayClient,
} from "@karya/razorpay";
import type { Env } from "../env.js";
import { razorpayConfigured } from "../env.js";
import { writeAuditEvent } from "./audit.js";
import { getSession, insertSession, updateSession } from "./a2a-sessions.js";

export type A2ACheckoutDeps = {
  store: GraphStore;
  db: Db;
  env: Env;
  razorpayClient?: RazorpayClient;
  audit: typeof writeAuditEvent;
};

export class A2ACheckoutError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    public readonly skuKey?: string,
    public readonly detail?: string,
  ) {
    super(code);
    this.name = "A2ACheckoutError";
  }
}

function newSessionId(): string {
  return `cs_${ulid()}`;
}

function sessionToApi(doc: A2ASessionDocument): CheckoutSession {
  const session: CheckoutSession = {
    id: doc._id,
    status: doc.status,
    lineItems: doc.lineItems,
    totals: doc.totals,
    fulfillment: doc.fulfillment,
    createdAt: doc.createdAt.toISOString(),
    expiresAt: doc.expiresAt.toISOString(),
  };
  if (doc.buyer) {
    session.buyer = doc.buyer;
  }
  if (doc.completedAt) {
    session.completedAt = doc.completedAt.toISOString();
  }
  if (doc.salesOrderKey) {
    session.salesOrderKey = doc.salesOrderKey;
  }
  if (doc.paymentLinkId) {
    session.paymentLinkId = doc.paymentLinkId;
  }
  return session;
}

function completedResponse(
  doc: A2ASessionDocument,
  shortUrl: string,
): CompleteCheckoutSessionResponse {
  if (!doc.salesOrderId || !doc.salesOrderKey || !doc.paymentLinkId) {
    throw new A2ACheckoutError("incomplete_session", 500);
  }
  return {
    session: sessionToApi(doc),
    order: {
      id: doc.salesOrderId,
      orderKey: doc.salesOrderKey,
      status: "pending_payment",
    },
    payment: {
      paymentLinkId: doc.paymentLinkId,
      shortUrl,
      status: "created",
    },
  };
}

export async function createCheckoutSession(
  deps: A2ACheckoutDeps,
  orgId: string,
  input: CreateCheckoutSessionRequest,
): Promise<CheckoutSession> {
  const catalog = await buildCatalog(deps.store, orgId);
  const validation = validateLineItems(input.lineItems, catalog.items);
  if (!validation.ok) {
    const status = validation.error === "insufficient_stock" ? 409 : 400;
    throw new A2ACheckoutError(validation.error, status, validation.skuKey);
  }

  const totals = computeTotals(input.lineItems, catalog.items);
  const fulfillment = computeFulfillment(input.lineItems, catalog.items);
  const now = new Date();
  const doc: A2ASessionDocument = {
    _id: newSessionId(),
    orgId,
    status: "pending",
    lineItems: input.lineItems,
    totals,
    fulfillment,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
  };
  if (input.buyer) {
    doc.buyer = input.buyer;
  }

  await insertSession(deps.db, doc);

  await deps.audit(deps.store, {
    orgId,
    eventType: "a2a.checkout.session_created",
    actor: "a2a:buyer",
    sideEffectClass: "write",
    payload: {
      sessionId: doc._id,
      lineItems: doc.lineItems,
      totals: doc.totals,
    },
  });

  return sessionToApi(doc);
}

export async function completeCheckoutSession(
  deps: A2ACheckoutDeps,
  orgId: string,
  sessionId: string,
  input?: { idempotencyKey?: string },
): Promise<CompleteCheckoutSessionResponse> {
  const session = await getSession(deps.db, sessionId);
  if (!session || session.orgId !== orgId) {
    throw new A2ACheckoutError("session_not_found", 404);
  }

  if (session.status === "completed" && session.paymentLinkId) {
    const payment = session.paymentNodeId
      ? await deps.store.getNode(orgId, session.paymentNodeId)
      : null;
    const shortUrl = String(payment?.props.short_url ?? "");
    return completedResponse(session, shortUrl);
  }

  if (session.status !== "pending") {
    throw new A2ACheckoutError("session_not_pending", 409);
  }

  if (session.expiresAt.getTime() < Date.now()) {
    await updateSession(deps.db, sessionId, { status: "expired" });
    throw new A2ACheckoutError("session_expired", 410);
  }

  const catalog = await buildCatalog(deps.store, orgId);
  const validation = validateLineItems(session.lineItems, catalog.items);
  if (!validation.ok) {
    throw new A2ACheckoutError(
      validation.error,
      validation.error === "insufficient_stock" ? 409 : 400,
      validation.skuKey,
    );
  }

  if (!razorpayConfigured(deps.env) || !deps.razorpayClient) {
    throw new A2ACheckoutError("razorpay_not_configured", 503);
  }

  // Resolve SKUs + check availability before any side effects.
  const resolvedLines: Array<{
    sku: NonNullable<Awaited<ReturnType<GraphStore["getNodeByKey"]>>>;
    stock: NonNullable<Awaited<ReturnType<typeof findStockForSku>>>;
    quantity: number;
  }> = [];

  for (const line of session.lineItems) {
    const sku = await deps.store.getNodeByKey(orgId, line.skuKey);
    if (!sku) {
      throw new A2ACheckoutError("sku_not_found", 400, line.skuKey);
    }

    const stock = await findStockForSku(deps.store, orgId, sku._id);
    if (!stock) {
      throw new A2ACheckoutError("insufficient_stock", 409, line.skuKey);
    }

    const onHand = Number(stock.props.on_hand ?? 0);
    const currentReserved = Number(stock.props.reserved ?? 0);
    const available = onHand - currentReserved;
    if (available < line.quantity) {
      throw new A2ACheckoutError(
        "insufficient_stock",
        409,
        line.skuKey,
        `Insufficient stock: ${available} available, ${line.quantity} requested`,
      );
    }

    resolvedLines.push({ sku, stock, quantity: line.quantity });
  }

  const orderKey = `SalesOrder:SO-A2A-${ulid().slice(0, 8).toUpperCase()}`;
  const key =
    input?.idempotencyKey ??
    idempotencyKey(orgId, "a2a_checkout", sessionId);

  const buyerName = session.buyer?.name ?? "AI Buyer Agent";
  const customer: { name: string; email?: string } = { name: buyerName };
  if (session.buyer?.email) {
    customer.email = session.buyer.email;
  }

  // 1. Call Razorpay first (can fail safely — no graph state changed yet)
  const razorpay = await createPaymentLink(
    deps.razorpayClient,
    {
      amountInPaise: session.totals.totalInPaise,
      description: `A2A order ${orderKey}`,
      customer,
      notes: {
        org_id: orgId,
        checkout_session_id: sessionId,
        sales_order_key: orderKey,
      },
    },
    key,
  );

  // 2. Only THEN write graph nodes + reserve stock + update session
  try {
    const salesOrder = await deps.store.upsertNode({
      _id: newNodeId(),
      orgId,
      type: "SalesOrder",
      key: orderKey,
      label: orderKey.replace(/^SalesOrder:/, ""),
      props: {
        status: "pending_payment",
        channel: "a2a",
        session_id: sessionId,
        totalInPaise: session.totals.totalInPaise,
        promise_date: session.fulfillment.estimatedShipDate,
      },
    });

    const stockNodeIds: string[] = [];

    for (const line of resolvedLines) {
      await deps.store.writeEdge({
        _id: newEdgeId(),
        orgId,
        type: "ORDER_CONTAINS",
        fromId: salesOrder._id,
        toId: line.sku._id,
        props: { qty: line.quantity, uom: "ea" },
        validFrom: new Date(),
      });

      // Re-read stock at reservation time to avoid concurrent over-reserve.
      const stock =
        (await deps.store.getNode(orgId, line.stock._id)) ?? line.stock;
      const onHand = Number(stock.props.on_hand ?? 0);
      const currentReserved = Number(stock.props.reserved ?? 0);
      const available = onHand - currentReserved;
      if (available < line.quantity) {
        throw new A2ACheckoutError(
          "insufficient_stock",
          409,
          line.sku.key,
          `Insufficient stock: ${available} available, ${line.quantity} requested`,
        );
      }

      const reserved = currentReserved + line.quantity;
      await deps.store.upsertNode({
        _id: stock._id,
        orgId: stock.orgId,
        type: stock.type,
        key: stock.key,
        label: stock.label,
        props: {
          ...stock.props,
          reserved,
        },
      });
      stockNodeIds.push(stock._id);
    }

    const buyerOrg = await deps.store.upsertNode({
      _id: newNodeId(),
      orgId,
      type: "Org",
      key: "Org:AI-Buyer",
      label: buyerName,
      props: {
        role: "customer",
        source: "a2a",
      },
    });

    await deps.store.writeEdge({
      _id: newEdgeId(),
      orgId,
      type: "BUYS",
      fromId: buyerOrg._id,
      toId: salesOrder._id,
      props: {},
      validFrom: new Date(),
    });

    const paymentNode = await deps.store.upsertNode({
      _id: newNodeId(),
      orgId,
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
        checkout_session_id: sessionId,
      },
    });

    await deps.store.writeEdge({
      _id: newEdgeId(),
      orgId,
      type: "PAYS",
      fromId: paymentNode._id,
      toId: salesOrder._id,
      props: {},
      validFrom: new Date(),
    });

    const completedAt = new Date();
    const updated = await updateSession(deps.db, sessionId, {
      status: "completed",
      completedAt,
      salesOrderKey: orderKey,
      salesOrderId: salesOrder._id,
      paymentLinkId: razorpay.id,
      paymentNodeId: paymentNode._id,
      idempotencyKey: key,
    });

    if (!updated) {
      throw new A2ACheckoutError("session_not_found", 404);
    }

    await deps.audit(deps.store, {
      orgId,
      eventType: "a2a.checkout.completed",
      actor: "a2a:buyer",
      sideEffectClass: "money",
      payload: {
        sessionId,
        salesOrderKey: orderKey,
        paymentLinkId: razorpay.id,
        shortUrl: razorpay.short_url,
      },
      aboutNodeIds: [salesOrder._id, paymentNode._id, ...stockNodeIds],
    });

    await deps.audit(deps.store, {
      orgId,
      eventType: "payment_link.created",
      actor: "a2a:buyer",
      sideEffectClass: "money",
      payload: {
        salesOrderKey: orderKey,
        razorpayPaymentLinkId: razorpay.id,
        shortUrl: razorpay.short_url,
        amountInPaise: razorpay.amount,
        checkoutSessionId: sessionId,
      },
      aboutNodeIds: [paymentNode._id, salesOrder._id],
    });

    return completedResponse(updated, razorpay.short_url);
  } catch (err) {
    if (err instanceof A2ACheckoutError) {
      throw err;
    }
    throw new A2ACheckoutError(
      "checkout_graph_failed",
      500,
      undefined,
      err instanceof Error ? err.message : "Graph write failed after payment link creation",
    );
  }
}

export async function getA2AOrder(
  deps: A2ACheckoutDeps,
  orgId: string,
  id: string,
): Promise<A2AOrderResponse> {
  if (id.startsWith("cs_")) {
    const session = await getSession(deps.db, id);
    if (!session || session.orgId !== orgId) {
      throw new A2ACheckoutError("order_not_found", 404);
    }
    return mapSessionToOrder(deps, orgId, session);
  }

  const orderKey = id.startsWith("SalesOrder:") ? id : `SalesOrder:${id}`;
  const salesOrder = await deps.store.getNodeByKey(orgId, orderKey);
  if (!salesOrder || salesOrder.type !== "SalesOrder") {
    throw new A2ACheckoutError("order_not_found", 404);
  }

  const sessionId =
    typeof salesOrder.props.session_id === "string"
      ? salesOrder.props.session_id
      : "";
  const session = sessionId ? await getSession(deps.db, sessionId) : null;

  const hood = await deps.store.neighborhood(orgId, salesOrder._id, 1);
  const paysEdge = hood.edges.find(
    (e) =>
      e.type === "PAYS" &&
      e.toId === salesOrder._id &&
      e.validTo === null,
  );
  const payment = paysEdge
    ? hood.nodes.find((n) => n._id === paysEdge.fromId)
    : null;

  const status = mapPaymentToOrderStatus(
    String(salesOrder.props.status ?? "pending_payment"),
    payment ? String(payment.props.status ?? "") : undefined,
  );

  const lineItems = session?.lineItems ?? [];
  const totals = session?.totals ?? {
    subtotalInPaise: Number(salesOrder.props.totalInPaise ?? 0),
    gstInPaise: 0,
    totalInPaise: Number(salesOrder.props.totalInPaise ?? 0),
  };

  const order: A2AOrderResponse["order"] = {
    id: salesOrder._id,
    orderKey: salesOrder.key,
    sessionId: sessionId || session?._id || "",
    status,
    lineItems,
    totals,
    salesOrderKey: salesOrder.key,
    createdAt: salesOrder.createdAt.toISOString(),
    updatedAt: salesOrder.updatedAt.toISOString(),
  };

  if (payment) {
    order.payment = {
      paymentLinkId: String(payment.props.razorpay_payment_link_id ?? ""),
      shortUrl: String(payment.props.short_url ?? ""),
      status: String(payment.props.status ?? ""),
    };
  }

  return { order };
}

async function mapSessionToOrder(
  deps: A2ACheckoutDeps,
  orgId: string,
  session: A2ASessionDocument,
): Promise<A2AOrderResponse> {
  let status: A2AOrderResponse["order"]["status"] = "pending_payment";
  let payment:
    | A2AOrderResponse["order"]["payment"]
    | undefined;

  if (session.salesOrderKey) {
    const salesOrder = await deps.store.getNodeByKey(
      orgId,
      session.salesOrderKey,
    );
    if (salesOrder) {
      const hood = await deps.store.neighborhood(orgId, salesOrder._id, 1);
      const paysEdge = hood.edges.find(
        (e) =>
          e.type === "PAYS" &&
          e.toId === salesOrder._id &&
          e.validTo === null,
      );
      const paymentNode = paysEdge
        ? hood.nodes.find((n) => n._id === paysEdge.fromId)
        : null;
      status = mapPaymentToOrderStatus(
        String(salesOrder.props.status ?? "pending_payment"),
        paymentNode ? String(paymentNode.props.status ?? "") : undefined,
      );
      if (paymentNode) {
        payment = {
          paymentLinkId: String(
            paymentNode.props.razorpay_payment_link_id ?? "",
          ),
          shortUrl: String(paymentNode.props.short_url ?? ""),
          status: String(paymentNode.props.status ?? ""),
        };
      }
    }
  } else if (session.status === "expired") {
    status = "expired";
  } else if (session.status === "cancelled") {
    status = "cancelled";
  }

  const order: A2AOrderResponse["order"] = {
    id: session._id,
    sessionId: session._id,
    status,
    lineItems: session.lineItems,
    totals: session.totals,
    createdAt: session.createdAt.toISOString(),
    updatedAt: (session.completedAt ?? session.createdAt).toISOString(),
  };
  if (session.salesOrderKey) {
    order.orderKey = session.salesOrderKey;
    order.salesOrderKey = session.salesOrderKey;
  }
  if (payment) {
    order.payment = payment;
  }
  return { order };
}

function mapPaymentToOrderStatus(
  salesOrderStatus: string,
  paymentStatus?: string,
): A2AOrderResponse["order"]["status"] {
  if (
    salesOrderStatus === "paid" ||
    salesOrderStatus === "open" ||
    paymentStatus === "captured" ||
    paymentStatus === "paid"
  ) {
    return "paid";
  }
  if (paymentStatus === "expired" || salesOrderStatus === "expired") {
    return "expired";
  }
  if (salesOrderStatus === "cancelled") {
    return "cancelled";
  }
  return "pending_payment";
}
