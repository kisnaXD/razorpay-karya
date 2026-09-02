import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { Env } from "../env.js";
import {
  draftPurchaseOrder,
} from "../services/purchase-orders.js";
import {
  enqueueBrowse,
  explainSourcingNeed,
  getBrowseJob,
  listSourcingVendors,
} from "../services/sourcing.js";
import { ApprovalDeniedError } from "../services/approvals.js";

type PluginOpts = { env: Env };

const draftBodySchema = z.object({
  vendorOrgKey: z.string().min(1),
  materialKey: z.string().min(1),
  qtyKg: z.number().positive(),
  reasonSalesOrderKeys: z.array(z.string()).optional(),
  expectedAtDays: z.number().int().positive().optional(),
  explanation: z.string().min(8),
});

const browseBodySchema = z.object({
  url: z.string().url(),
  purpose: z.string().min(1),
  explanation: z.string().min(8),
  materialKey: z.string().optional(),
});

export const sourcingRoutes: FastifyPluginAsync<PluginOpts> = async (
  app,
  opts,
) => {
  app.get("/v1/sourcing/vendors", async (request) => {
    const query = request.query as {
      materialKey?: string;
      limit?: string;
    };
    const materialKey = query.materialKey ?? "Material:BrassSheet-22g";
    const limit = query.limit ? Number(query.limit) : 3;
    const result = await listSourcingVendors(materialKey, limit);
    return result;
  });

  app.get("/v1/sourcing/need", async (request, reply) => {
    const query = request.query as {
      materialKey?: string;
      soKey?: string;
    };
    if (!query.materialKey) {
      return reply.code(400).send({ error: "materialKey required" });
    }
    try {
      const result = await explainSourcingNeed(
        app.store,
        request.orgId,
        query.materialKey,
        query.soKey,
      );
      return result;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Material not found")) {
        return reply.code(404).send({ error: "material_not_found" });
      }
      throw err;
    }
  });

  app.post<{ Body: z.infer<typeof draftBodySchema> }>(
    "/v1/sourcing/draft-po",
    async (request, reply) => {
      const parsed = draftBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "invalid_body", details: parsed.error.flatten() });
      }
      try {
        const result = await draftPurchaseOrder(app.db, app.store, {
          orgId: request.orgId,
          ...parsed.data,
          proposedBy: "agent:sourcing",
        });
        return result;
      } catch (err) {
        if (err instanceof ApprovalDeniedError) {
          return reply
            .code(403)
            .send({ denied: true, evaluation: err.evaluation });
        }
        throw err;
      }
    },
  );

  app.post<{ Body: z.infer<typeof browseBodySchema> }>(
    "/v1/sourcing/browse",
    async (request, reply) => {
      const parsed = browseBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "invalid_body", details: parsed.error.flatten() });
      }
      const result = await enqueueBrowse(app.store, request.orgId, {
        ...parsed.data,
        browserEnabled: opts.env.BROWSER_ENABLED === true,
      });
      if (!result.ok) {
        return reply.code(503).send({
          error: result.error,
          fallback: "directory",
          vendors: result.fallbackVendors.vendors,
        });
      }
      return { jobId: result.jobId };
    },
  );

  app.get<{ Params: { jobId: string } }>(
    "/v1/sourcing/browse/:jobId",
    async (request) => {
      return getBrowseJob(app.db, request.orgId, request.params.jobId);
    },
  );
};
