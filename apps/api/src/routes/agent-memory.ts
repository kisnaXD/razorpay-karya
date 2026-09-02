import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  listMemories,
  recordMemory,
  searchMemories,
} from "../services/agent-memory.js";

const postBodySchema = z.object({
  kind: z.enum(["preference", "decision", "override"]),
  subject: z.string().min(1),
  content: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

function actorFrom(headers: Record<string, unknown>): string {
  const actor = headers["x-actor"];
  return typeof actor === "string" && actor.length > 0
    ? actor
    : "human:anika@arka.atelier";
}

export const agentMemoryRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/agent/memories", async (request) => {
    const q = request.query as {
      tags?: string;
      subject?: string;
      limit?: string;
    };
    const tags =
      typeof q.tags === "string" && q.tags.length > 0
        ? q.tags.split(",").map((t) => t.trim()).filter(Boolean)
        : undefined;
    const limit = q.limit ? Number(q.limit) : undefined;
    const hasFilters = Boolean(tags?.length || q.subject || limit);

    if (!hasFilters) {
      const memories = await listMemories(app.db, request.orgId);
      return { memories };
    }

    const memories = await searchMemories(app.db, request.orgId, {
      ...(tags?.length ? { tags } : {}),
      ...(typeof q.subject === "string" && q.subject.length > 0
        ? { subject: q.subject }
        : {}),
      ...(typeof limit === "number" && Number.isFinite(limit)
        ? { limit }
        : {}),
    });
    return { memories };
  });

  app.post<{ Body: z.infer<typeof postBodySchema> }>(
    "/v1/agent/memories",
    async (request, reply) => {
      const parsed = postBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body" });
      }

      const memory = await recordMemory(app.db, request.orgId, {
        kind: parsed.data.kind,
        subject: parsed.data.subject,
        content: parsed.data.content,
        tags: parsed.data.tags,
        source: {
          type: "user",
          actor: actorFrom(request.headers as Record<string, unknown>),
        },
      });
      return { memory };
    },
  );
};
