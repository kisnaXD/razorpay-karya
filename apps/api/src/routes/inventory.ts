import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { PromiseSkuNotFoundError } from "@karya/agents";
import { runPromiseQuery } from "../services/inventory.js";

const promiseBodySchema = z.object({
  skuKey: z.string().min(1),
  qty: z.number().int().positive(),
  promiseDate: z.string().optional(),
  excludeSalesOrderKey: z.string().optional(),
});

export const inventoryRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: z.infer<typeof promiseBodySchema> }>(
    "/v1/inventory/promise",
    async (request, reply) => {
      const parsed = promiseBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      }

      try {
        const result = await runPromiseQuery(app.store, request.orgId, {
          skuKey: parsed.data.skuKey,
          qty: parsed.data.qty,
          ...(parsed.data.promiseDate !== undefined
            ? { promiseDate: parsed.data.promiseDate }
            : {}),
          ...(parsed.data.excludeSalesOrderKey !== undefined
            ? { excludeSalesOrderKey: parsed.data.excludeSalesOrderKey }
            : {}),
        });
        return { result };
      } catch (err) {
        if (err instanceof PromiseSkuNotFoundError) {
          return reply.code(404).send({ error: "sku_not_found", skuKey: err.skuKey });
        }
        throw err;
      }
    },
  );
};
