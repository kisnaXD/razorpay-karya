import type { FastifyPluginAsync } from "fastify";
import type { GraphStore, NodeRecord } from "@karya/graph";
import { newNodeId } from "@karya/graph";
import {
  type RazorpayWebhookPayload,
  verifyWebhookSignature,
} from "@karya/razorpay";
import type { Db } from "mongodb";
import type { Env } from "../env.js";
import { writeAuditEvent } from "../services/audit.js";
import { handlePaymentFailure } from "../services/payment-failure.js";

type PluginOpts = { env: Env; store: GraphStore };

export type WebhookDispatchOpts = {
  db?: Db;
  onPaymentFailure?: (
    paymentKey: string,
    webhookEvent: string,
  ) => Promise<void>;
};

async function findPaymentByRazorpayId(
  store: GraphStore,
  orgId: string,
  ids: { paymentLinkId?: string; paymentId?: string },
): Promise<NodeRecord | null> {
  const payments = await store.listNodes(orgId, "Payment");
  return (
    payments.find((p) => {
      if (
        ids.paymentLinkId &&
        p.props.razorpay_payment_link_id === ids.paymentLinkId
      ) {
        return true;
      }
      if (ids.paymentId && p.props.razorpay_payment_id === ids.paymentId) {
        return true;
      }
      return false;
    }) ?? null
  );
}

async function findPaymentAcrossOrgs(
  store: GraphStore,
  ids: { paymentLinkId?: string; paymentId?: string },
): Promise<{ payment: NodeRecord; orgId: string } | null> {
  for (const orgId of ["org_arka"]) {
    const payment = await findPaymentByRazorpayId(store, orgId, ids);
    if (payment) {
      return { payment, orgId };
    }
  }
  return null;
}

async function linkedPayTarget(
  store: GraphStore,
  orgId: string,
  paymentId: string,
): Promise<NodeRecord | null> {
  const graph = await store.neighborhood(orgId, paymentId, 1);
  for (const edge of graph.edges) {
    if (
      edge.type === "PAYS" &&
      edge.fromId === paymentId &&
      edge.validTo === null
    ) {
      const target =
        graph.nodes.find((n) => n._id === edge.toId) ??
        (await store.getNode(orgId, edge.toId));
      return target ?? null;
    }
  }
  return null;
}

async function updatePaymentProps(
  store: GraphStore,
  payment: NodeRecord,
  props: Record<string, string | number | boolean | null>,
): Promise<NodeRecord> {
  return store.upsertNode({
    _id: payment._id,
    orgId: payment.orgId,
    type: payment.type,
    key: payment.key,
    label: payment.label,
    props: { ...payment.props, ...props },
  });
}

async function markTargetPaid(
  store: GraphStore,
  orgId: string,
  target: NodeRecord,
): Promise<NodeRecord> {
  return store.upsertNode({
    _id: target._id,
    orgId,
    type: target.type,
    key: target.key,
    label: target.label,
    props: { ...target.props, status: "paid" },
  });
}

export async function dispatchRazorpayWebhook(
  store: GraphStore,
  payload: RazorpayWebhookPayload,
  opts?: WebhookDispatchOpts,
): Promise<void> {
  const { event } = payload;

  switch (event) {
    case "payment_link.paid":
      await handlePaymentLinkPaid(store, payload);
      break;
    case "payment_link.expired":
      await handlePaymentLinkExpired(store, payload, opts);
      break;
    case "payment.captured":
      await handlePaymentCaptured(store, payload);
      break;
    case "payment.failed":
      await handlePaymentFailed(store, payload, opts);
      break;
    case "refund.processed":
      await handleRefundProcessed(store, payload);
      break;
    default:
      break;
  }
}

export const webhookRoutes: FastifyPluginAsync<PluginOpts> = async (
  app,
  opts,
) => {
  app.post("/v1/webhooks/razorpay", async (request, reply) => {
    const secret = opts.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      return reply.code(503).send({ error: "webhook_secret_not_configured" });
    }

    const signature = request.headers["x-razorpay-signature"];
    if (typeof signature !== "string" || signature.length === 0) {
      return reply.code(401).send({ error: "invalid_signature" });
    }

    const rawBody =
      typeof request.body === "string"
        ? request.body
        : Buffer.isBuffer(request.body)
          ? request.body
          : Buffer.from(String(request.body ?? ""));

    if (!verifyWebhookSignature(rawBody, signature, secret)) {
      return reply.code(401).send({ error: "invalid_signature" });
    }

    const payload = JSON.parse(rawBody.toString()) as RazorpayWebhookPayload;
    await dispatchRazorpayWebhook(opts.store, payload, {
      db: app.db,
    });

    return { received: true };
  });
};

async function resolveOrgAndPayment(
  store: GraphStore,
  payload: RazorpayWebhookPayload,
  ids: { paymentLinkId?: string; paymentId?: string },
): Promise<{ orgId: string; payment: NodeRecord } | null> {
  const notesOrgId =
    payload.payload.payment_link?.entity.notes?.org_id ??
    payload.payload.payment?.entity.notes?.org_id;

  if (notesOrgId) {
    const payment = await findPaymentByRazorpayId(store, notesOrgId, ids);
    if (payment) {
      return { orgId: notesOrgId, payment };
    }
  }

  const found = await findPaymentAcrossOrgs(store, ids);
  if (found) {
    return found;
  }

  if (notesOrgId && ids.paymentLinkId) {
    const payment = await store.upsertNode({
      _id: newNodeId(),
      orgId: notesOrgId,
      type: "Payment",
      key: `Payment:${ids.paymentLinkId}`,
      label: ids.paymentLinkId,
      props: {
        status: "sent",
        channel: "payment_link",
        razorpay_payment_link_id: ids.paymentLinkId,
      },
    });
    return { orgId: notesOrgId, payment };
  }

  return null;
}

async function handlePaymentLinkPaid(
  store: GraphStore,
  payload: RazorpayWebhookPayload,
) {
  const linkId = payload.payload.payment_link?.entity.id;
  if (!linkId) {
    return;
  }

  const resolved = await resolveOrgAndPayment(store, payload, {
    paymentLinkId: linkId,
  });
  if (!resolved) {
    return;
  }

  const { orgId, payment } = resolved;
  const updated = await updatePaymentProps(store, payment, {
    status: "captured",
    razorpay_payment_link_id: linkId,
  });

  const target = await linkedPayTarget(store, orgId, updated._id);
  if (target && (target.type === "Invoice" || target.type === "SalesOrder")) {
    await markTargetPaid(store, orgId, target);
  }

  await writeAuditEvent(store, {
    orgId,
    eventType: "payment_link.paid",
    actor: "webhook:razorpay",
    sideEffectClass: "money",
    payload: { paymentLinkId: linkId },
    aboutNodeIds: [updated._id, ...(target ? [target._id] : [])],
  });
}

async function handlePaymentLinkExpired(
  store: GraphStore,
  payload: RazorpayWebhookPayload,
  opts?: WebhookDispatchOpts,
) {
  const linkId = payload.payload.payment_link?.entity.id;
  if (!linkId) {
    return;
  }

  const resolved = await resolveOrgAndPayment(store, payload, {
    paymentLinkId: linkId,
  });
  if (!resolved) {
    return;
  }

  const { orgId, payment } = resolved;
  const updated = await updatePaymentProps(store, payment, {
    status: "expired",
    razorpay_payment_link_id: linkId,
  });

  const target = await linkedPayTarget(store, orgId, updated._id);
  const aboutNodeIds = [updated._id];
  if (target?.type === "SalesOrder") {
    aboutNodeIds.push(target._id);
    await writeAuditEvent(store, {
      orgId,
      eventType: "a2a.payment.expired",
      actor: "webhook:razorpay",
      sideEffectClass: "money",
      payload: { paymentLinkId: linkId, salesOrderKey: target.key },
      aboutNodeIds: [updated._id, target._id],
    });
  }

  await writeAuditEvent(store, {
    orgId,
    eventType: "payment_link.expired",
    actor: "webhook:razorpay",
    sideEffectClass: "money",
    payload: { paymentLinkId: linkId },
    aboutNodeIds,
  });

  if (opts?.onPaymentFailure) {
    await opts.onPaymentFailure(updated.key, "payment_link.expired");
  } else if (opts?.db) {
    await handlePaymentFailure(
      store,
      opts.db,
      orgId,
      updated.key,
      "payment_link.expired",
    );
  }
}

async function handlePaymentCaptured(
  store: GraphStore,
  payload: RazorpayWebhookPayload,
) {
  const paymentEntity = payload.payload.payment?.entity;
  if (!paymentEntity) {
    return;
  }

  const resolved = await resolveOrgAndPayment(store, payload, {
    paymentId: paymentEntity.id,
  });
  if (!resolved) {
    return;
  }

  const { orgId, payment } = resolved;
  const updated = await updatePaymentProps(store, payment, {
    status: "captured",
    razorpay_payment_id: paymentEntity.id,
    amountInPaise: paymentEntity.amount,
  });

  const target = await linkedPayTarget(store, orgId, updated._id);
  if (target && (target.type === "Invoice" || target.type === "SalesOrder")) {
    await markTargetPaid(store, orgId, target);
  }

  await writeAuditEvent(store, {
    orgId,
    eventType: "payment.captured",
    actor: "webhook:razorpay",
    sideEffectClass: "money",
    payload: { paymentId: paymentEntity.id },
    aboutNodeIds: [updated._id, ...(target ? [target._id] : [])],
  });
}

async function handlePaymentFailed(
  store: GraphStore,
  payload: RazorpayWebhookPayload,
  opts?: WebhookDispatchOpts,
) {
  const paymentEntity = payload.payload.payment?.entity;
  if (!paymentEntity) {
    return;
  }

  const resolved = await resolveOrgAndPayment(store, payload, {
    paymentId: paymentEntity.id,
  });
  if (!resolved) {
    // Also try matching via payment_link id in payload
    const linkId = payload.payload.payment_link?.entity.id;
    if (linkId) {
      const byLink = await resolveOrgAndPayment(store, payload, {
        paymentLinkId: linkId,
      });
      if (byLink) {
        const updated = await updatePaymentProps(store, byLink.payment, {
          status: "failed",
          razorpay_payment_id: paymentEntity.id,
        });
        await writeAuditEvent(store, {
          orgId: byLink.orgId,
          eventType: "payment.failed",
          actor: "webhook:razorpay",
          sideEffectClass: "money",
          payload: { paymentId: paymentEntity.id },
          aboutNodeIds: [updated._id],
        });
        if (opts?.onPaymentFailure) {
          await opts.onPaymentFailure(updated.key, "payment.failed");
        } else if (opts?.db) {
          await handlePaymentFailure(
            store,
            opts.db,
            byLink.orgId,
            updated.key,
            "payment.failed",
          );
        }
        return;
      }
    }
    return;
  }

  const { orgId, payment } = resolved;
  const updated = await updatePaymentProps(store, payment, {
    status: "failed",
    razorpay_payment_id: paymentEntity.id,
  });

  await writeAuditEvent(store, {
    orgId,
    eventType: "payment.failed",
    actor: "webhook:razorpay",
    sideEffectClass: "money",
    payload: { paymentId: paymentEntity.id },
    aboutNodeIds: [updated._id],
  });

  if (opts?.onPaymentFailure) {
    await opts.onPaymentFailure(updated.key, "payment.failed");
  } else if (opts?.db) {
    await handlePaymentFailure(
      store,
      opts.db,
      orgId,
      updated.key,
      "payment.failed",
    );
  }
}

async function handleRefundProcessed(
  store: GraphStore,
  payload: RazorpayWebhookPayload,
) {
  const refund = payload.payload.refund?.entity;
  if (!refund) {
    return;
  }

  const resolved = await resolveOrgAndPayment(store, payload, {
    paymentId: refund.payment_id,
  });
  if (!resolved) {
    return;
  }

  const { orgId, payment } = resolved;
  const updated = await updatePaymentProps(store, payment, {
    refund_status: "processed",
    razorpay_refund_id: refund.id,
  });

  await writeAuditEvent(store, {
    orgId,
    eventType: "refund.processed",
    actor: "webhook:razorpay",
    sideEffectClass: "money",
    payload: {
      refundId: refund.id,
      paymentId: refund.payment_id,
      amount: refund.amount,
    },
    aboutNodeIds: [updated._id],
  });
}
