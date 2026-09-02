import type { FastifyPluginAsync } from "fastify";
import type { Env } from "../env.js";
import { runCollections } from "../services/collections.js";
import { handlePaymentFailure } from "../services/payment-failure.js";
import { buildRazorpayClient } from "../services/payout.js";
import { z } from "zod";

type PluginOpts = { env: Env };

const handleFailureSchema = z.object({
  paymentKey: z.string().min(1),
  webhookEvent: z
    .enum(["payment_link.expired", "payment.failed"])
    .default("payment_link.expired"),
});

export const agentsMoneyRoutes: FastifyPluginAsync<PluginOpts> = async (
  app,
  opts,
) => {
  app.post("/v1/agents/money/tick", async (request) => {
    const client = buildRazorpayClient(opts.env);
    return runCollections(app.store, app.db, client, request.orgId);
  });

  app.post("/v1/agents/money/handle-failure", async (request, reply) => {
    const parsed = handleFailureSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "validation_error",
        detail: parsed.error.message,
      });
    }
    const result = await handlePaymentFailure(
      app.store,
      app.db,
      request.orgId,
      parsed.data.paymentKey,
      parsed.data.webhookEvent,
    );
    return {
      approvalIds: result.approvalIds,
      impactCopy: result.proposals[0]?.impactSummary ?? null,
      options: result.proposals.map((p) => p.option),
    };
  });
};
