import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ApprovalDeniedError } from "../services/approvals.js";
import { draftEmail, requestSendEmail } from "../services/comms.js";
import type { Env } from "../env.js";

type PluginOpts = { env: Env };

function actorFrom(request: { headers: Record<string, unknown> }): string {
  const actor = request.headers["x-actor"];
  return typeof actor === "string" && actor.length > 0
    ? actor
    : "human:anika@arka.atelier";
}

const draftBodySchema = z.object({
  aboutNodeKey: z.string().min(1),
  recipientOrgKey: z.string().min(1),
  tone: z.enum(["firm", "friendly"]).optional(),
  explanation: z.string().min(8).optional(),
});

const sendBodySchema = z.object({
  messageKey: z.string().min(1),
  explanation: z.string().min(8).optional(),
});

export const commsRoutes: FastifyPluginAsync<PluginOpts> = async (app) => {
  app.post<{ Body: z.infer<typeof draftBodySchema> }>(
    "/v1/comms/draft-email",
    async (request, reply) => {
      const parsed = draftBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body" });
      }
      try {
        const result = await draftEmail(app.store, request.orgId, {
          aboutNodeKey: parsed.data.aboutNodeKey,
          recipientOrgKey: parsed.data.recipientOrgKey,
          ...(parsed.data.tone !== undefined ? { tone: parsed.data.tone } : {}),
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

  app.post<{ Body: z.infer<typeof sendBodySchema> }>(
    "/v1/comms/send",
    async (request, reply) => {
      const parsed = sendBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body" });
      }
      try {
        const result = await requestSendEmail(
          app.db,
          app.store,
          request.orgId,
          {
            messageKey: parsed.data.messageKey,
            explanation:
              parsed.data.explanation ??
              "Send vendor chase email for PO-104",
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
