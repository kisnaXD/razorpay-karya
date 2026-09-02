import { createHmac } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { GraphStore, NodeRecord } from "@karya/graph";
import { buildSimulatedWebhookPayload } from "@karya/razorpay";
import { z } from "zod";
import type { Env } from "../env.js";
import { handlePaymentFailure } from "../services/payment-failure.js";
import { runCollections } from "../services/collections.js";
import { buildRazorpayClient } from "../services/payout.js";
import { dispatchRazorpayWebhook } from "./webhooks.js";

type PluginOpts = { env: Env; store: GraphStore };

const simulateBodySchema = z.object({
  event: z.enum([
    "payment_link.expired",
    "payment.failed",
    "payment_link.paid",
  ]),
  paymentLinkId: z.string().min(1).optional(),
  paymentKey: z.string().min(1).optional(),
});

async function resolveSimulatePayment(
  store: GraphStore,
  orgId: string,
  input: { paymentKey?: string; paymentLinkId?: string },
): Promise<NodeRecord> {
  if (input.paymentKey) {
    const byKey = await store.getNodeByKey(orgId, input.paymentKey);
    if (byKey) return byKey;
  }
  const linkId = input.paymentLinkId ?? "plink_7";
  const payments = await store.listNodes(orgId, "Payment");
  const byLink = payments.find(
    (p) => p.props.razorpay_payment_link_id === linkId,
  );
  if (byLink) return byLink;
  const fallback = await store.getNodeByKey(orgId, "Payment:plink_7");
  if (fallback) return fallback;
  throw new Error(`payment_not_found:${input.paymentKey ?? linkId}`);
}

export const adminRoutes: FastifyPluginAsync<PluginOpts> = async (
  app,
  opts,
) => {
  app.post("/v1/admin/simulate-webhook", async (request, reply) => {
    if (opts.env.NODE_ENV !== "development") {
      return reply.code(403).send({ error: "simulate_webhook_dev_only" });
    }

    const parsed = simulateBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "validation_error",
        detail: parsed.error.message,
      });
    }

    const orgId = request.orgId;
    let payment: NodeRecord;
    try {
      payment = await resolveSimulatePayment(opts.store, orgId, {
        ...(parsed.data.paymentKey
          ? { paymentKey: parsed.data.paymentKey }
          : {}),
        ...(parsed.data.paymentLinkId
          ? { paymentLinkId: parsed.data.paymentLinkId }
          : {}),
      });
    } catch (err) {
      return reply.code(404).send({
        error: err instanceof Error ? err.message : "payment_not_found",
      });
    }

    const paymentLinkId = String(
      payment.props.razorpay_payment_link_id ??
        parsed.data.paymentLinkId ??
        "plink_7",
    );
    const amountInPaise =
      typeof payment.props.amountInPaise === "number"
        ? payment.props.amountInPaise
        : 0;

    const { body, payload } = buildSimulatedWebhookPayload({
      event: parsed.data.event,
      paymentLinkId,
      amountInPaise,
      orgId,
    });

    await dispatchRazorpayWebhook(opts.store, payload, {
      db: app.db,
      onPaymentFailure: async (paymentKey, event) => {
        await handlePaymentFailure(
          opts.store,
          app.db,
          orgId,
          paymentKey,
          event,
        );
      },
    });

    const secret = opts.env.RAZORPAY_WEBHOOK_SECRET ?? "dev";
    const signature = createHmac("sha256", secret).update(body).digest("hex");

    return {
      received: true,
      signature,
      eventType: parsed.data.event,
      paymentNodeId: payment._id,
      dispatched: parsed.data.event,
    };
  });

  app.post("/v1/admin/run-collections", async (request, reply) => {
    if (opts.env.NODE_ENV !== "development") {
      return reply.code(403).send({ error: "run_collections_dev_only" });
    }
    const client = buildRazorpayClient(opts.env);
    const result = await runCollections(
      opts.store,
      app.db,
      client,
      request.orgId,
    );
    return result;
  });
};
