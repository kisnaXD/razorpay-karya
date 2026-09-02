import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ApprovalDeniedError } from "../services/approvals.js";
import {
  draftListing,
  getListingWithSku,
  requestPublishListing,
} from "../services/listings.js";

function actorFrom(request: { headers: Record<string, unknown> }): string {
  const actor = request.headers["x-actor"];
  return typeof actor === "string" && actor.length > 0
    ? actor
    : "human:anika@arka.atelier";
}

const draftBodySchema = z.object({
  skuKey: z.string().min(1),
  channel: z.enum(["instagram", "catalog"]).default("instagram"),
});

const publishBodySchema = z.object({
  listingKey: z.string().min(1),
  explanation: z.string().min(8).optional(),
});

export const listingsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { listingKey?: string } }>(
    "/v1/listings",
    async (request, reply) => {
      const listingKey =
        request.query.listingKey ?? "Listing:Diya-Large-Instagram";
      try {
        const result = await getListingWithSku(
          app.store,
          request.orgId,
          listingKey,
        );
        return result;
      } catch (err) {
        return reply
          .code(404)
          .send({ error: err instanceof Error ? err.message : "not_found" });
      }
    },
  );

  app.post<{ Body: z.infer<typeof draftBodySchema> }>(
    "/v1/listings/draft",
    async (request, reply) => {
      const parsed = draftBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body" });
      }
      try {
        const result = await draftListing(app.store, request.orgId, {
          skuKey: parsed.data.skuKey,
          channel: parsed.data.channel,
          actor: actorFrom(request),
        });
        return result;
      } catch (err) {
        return reply
          .code(404)
          .send({ error: err instanceof Error ? err.message : "not_found" });
      }
    },
  );

  app.post<{ Body: z.infer<typeof publishBodySchema> }>(
    "/v1/listings/publish",
    async (request, reply) => {
      const parsed = publishBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body" });
      }
      try {
        const result = await requestPublishListing(
          app.db,
          app.store,
          request.orgId,
          {
            listingKey: parsed.data.listingKey,
            explanation:
              parsed.data.explanation ??
              "Publish Instagram listing draft for Diya-Large",
            actor: actorFrom(request),
          },
        );
        if ("autoAllowed" in result) {
          return { autoAllowed: true, evaluation: result.evaluation };
        }
        return { approval: result.approval };
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
};
