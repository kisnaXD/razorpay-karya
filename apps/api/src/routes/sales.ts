import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { writeAuditEvent } from "../services/audit.js";
import {
  PromiseRejectedError,
  SalesOrderNotFoundError,
  acceptSalesOrder,
  generateQuote,
  getOrderBook,
  rejectSalesOrder,
} from "../services/sales.js";

const quoteBodySchema = z.object({
  skuKey: z.string().min(1),
  qty: z.number().int().positive(),
  customerOrgKey: z.string().optional(),
});

const acceptBodySchema = z.object({
  customerOrgKey: z.string().min(1),
  skuKey: z.string().min(1),
  qty: z.number().int().positive(),
  promiseDate: z.string().min(1),
});

const rejectBodySchema = z.object({
  salesOrderKey: z.string().min(1),
  reason: z.string().min(1),
});

function actorFrom(request: { headers: Record<string, unknown> }): string {
  const actor = request.headers["x-actor"];
  return typeof actor === "string" && actor.length > 0
    ? actor
    : "human:anika@arka.atelier";
}

export const salesRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { status?: string } }>(
    "/v1/sales/orders",
    async (request) => {
      const status = request.query.status;
      const orders = await getOrderBook(
        app.store,
        request.orgId,
        status ? { status } : undefined,
      );
      return { orders };
    },
  );

  app.post<{ Body: z.infer<typeof quoteBodySchema> }>(
    "/v1/sales/quote",
    async (request, reply) => {
      const parsed = quoteBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body" });
      }
      try {
        const quote = await generateQuote(app.store, request.orgId, {
          skuKey: parsed.data.skuKey,
          qty: parsed.data.qty,
          ...(parsed.data.customerOrgKey !== undefined
            ? { customerOrgKey: parsed.data.customerOrgKey }
            : {}),
        });
        return { quote };
      } catch (err) {
        return reply
          .code(404)
          .send({ error: err instanceof Error ? err.message : "not_found" });
      }
    },
  );

  app.post<{ Body: z.infer<typeof acceptBodySchema> }>(
    "/v1/sales/accept",
    async (request, reply) => {
      const parsed = acceptBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body" });
      }
      try {
        const result = await acceptSalesOrder(
          app.store,
          request.orgId,
          writeAuditEvent,
          { ...parsed.data, actor: actorFrom(request) },
        );
        return {
          salesOrder: result.salesOrder,
          promiseResult: result.promiseResult,
        };
      } catch (err) {
        if (err instanceof PromiseRejectedError) {
          return reply.code(409).send({
            error: "promise_rejected",
            promiseResult: err.promiseResult,
          });
        }
        return reply
          .code(400)
          .send({ error: err instanceof Error ? err.message : "accept_failed" });
      }
    },
  );

  app.post<{ Body: z.infer<typeof rejectBodySchema> }>(
    "/v1/sales/reject",
    async (request, reply) => {
      const parsed = rejectBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body" });
      }
      try {
        const salesOrder = await rejectSalesOrder(
          app.store,
          request.orgId,
          writeAuditEvent,
          { ...parsed.data, actor: actorFrom(request) },
        );
        return { salesOrder };
      } catch (err) {
        if (err instanceof SalesOrderNotFoundError) {
          return reply.code(404).send({ error: "not_found" });
        }
        throw err;
      }
    },
  );
};
