import type { FastifyPluginAsync } from "fastify";
import { RazorpayError } from "@karya/razorpay";
import type { ProposedAction } from "@karya/policy";
import type { Env } from "../env.js";
import { razorpayConfigured } from "../env.js";
import { writeAuditEvent } from "../services/audit.js";
import { evaluateAction } from "../services/policy.js";
import {
  createPaymentLinkForInvoice,
  InvoiceNotFoundError,
} from "../services/payment-links.js";
import { buildRazorpayClient } from "../services/payout.js";

type PluginOpts = { env: Env };

export const paymentLinksRoutes: FastifyPluginAsync<PluginOpts> = async (
  app,
  opts,
) => {
  app.post<{ Body: { invoiceKey: string; idempotencyKey?: string } }>(
    "/v1/payment-links",
    async (request, reply) => {
      if (!razorpayConfigured(opts.env)) {
        return reply
          .code(503)
          .send({ error: "razorpay_not_configured" });
      }

      const { invoiceKey, idempotencyKey } = request.body ?? {};
      if (!invoiceKey) {
        return reply.code(400).send({ error: "invoiceKey required" });
      }

      const client = buildRazorpayClient(opts.env);
      if (!client) {
        return reply
          .code(503)
          .send({ error: "razorpay_not_configured" });
      }

      try {
        const invoice = await app.store.getNodeByKey(request.orgId, invoiceKey);
        if (!invoice || invoice.type !== "Invoice") {
          return reply.code(404).send({ error: "invoice_not_found" });
        }

        const actorHeader = request.headers["x-actor"];
        const proposedBy =
          typeof actorHeader === "string"
            ? actorHeader
            : "human:anika@arka.atelier";

        const amountRaw = invoice.props.amountInPaise;
        const proposed: ProposedAction = {
          action: "collect.invoice",
          orgId: request.orgId,
          targetNodeKey: invoice.key,
          explanation: `Payment Link for ${invoice.label}`,
          proposedBy,
          ...(typeof amountRaw === "number" ? { amountInPaise: amountRaw } : {}),
        };

        const evaluation = await evaluateAction(
          app.store,
          request.orgId,
          proposed,
        );
        await writeAuditEvent(app.store, {
          orgId: request.orgId,
          eventType: "policy.evaluated",
          actor: proposedBy,
          sideEffectClass: "read",
          payload: { proposed, evaluation },
          aboutNodeIds: [invoice._id],
        });

        if (evaluation.finalDecision === "deny") {
          return reply
            .code(403)
            .send({ error: "policy_denied", evaluation });
        }
        if (
          evaluation.finalDecision === "require_approval" &&
          proposedBy.startsWith("agent:")
        ) {
          return reply
            .code(403)
            .send({ error: "approval_required", evaluation });
        }

        const result = await createPaymentLinkForInvoice(
          app.store,
          client,
          writeAuditEvent,
          {
            orgId: request.orgId,
            invoiceKey,
            ...(idempotencyKey ? { idempotencyKey } : {}),
            actor: proposedBy,
          },
        );

        return {
          payment: result.paymentNode,
          razorpay: result.razorpay,
          created: result.created,
        };
      } catch (err) {
        if (err instanceof InvoiceNotFoundError) {
          return reply.code(404).send({ error: "invoice_not_found" });
        }
        if (err instanceof RazorpayError) {
          return reply.code(502).send({
            error: "razorpay_error",
            detail: err.body,
          });
        }
        throw err;
      }
    },
  );
};
