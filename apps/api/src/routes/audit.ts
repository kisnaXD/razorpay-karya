import type { FastifyPluginAsync } from "fastify";
import type { SideEffectClass } from "../services/audit.js";
import { listAuditEvents } from "../services/audit.js";

export const auditRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/audit", async (request) => {
    const query = request.query as {
      actor?: string;
      sideEffectClass?: string;
      minAmountPaise?: string;
      limit?: string;
    };

    const sideEffectClass = query.sideEffectClass as
      | SideEffectClass
      | undefined;
    const limit =
      query.limit !== undefined ? Number.parseInt(query.limit, 10) : undefined;
    const minAmountPaise =
      query.minAmountPaise !== undefined
        ? Number.parseInt(query.minAmountPaise, 10)
        : undefined;

    const events = await listAuditEvents(app.store, request.orgId, {
      ...(query.actor ? { actor: query.actor } : {}),
      ...(sideEffectClass ? { sideEffectClass } : {}),
      ...(minAmountPaise !== undefined && !Number.isNaN(minAmountPaise)
        ? { minAmountPaise }
        : {}),
      ...(limit !== undefined && !Number.isNaN(limit) ? { limit } : {}),
    });

    return { events };
  });
};
