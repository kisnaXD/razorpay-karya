import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  createFollowUpTask,
  getMeetingBrief,
  listMeetings,
} from "../services/calendar.js";

function actorFrom(request: { headers: Record<string, unknown> }): string {
  const actor = request.headers["x-actor"];
  return typeof actor === "string" && actor.length > 0
    ? actor
    : "human:anika@arka.atelier";
}

const followUpBodySchema = z.object({
  meetingKey: z.string().min(1),
  note: z.string().optional(),
});

export const calendarRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { from?: string; to?: string } }>(
    "/v1/calendar/meetings",
    async (request) => {
      const meetings = await listMeetings(app.store, request.orgId, {
        ...(request.query.from !== undefined
          ? { from: request.query.from }
          : {}),
        ...(request.query.to !== undefined ? { to: request.query.to } : {}),
      });
      return { meetings };
    },
  );

  app.get<{ Querystring: { meetingKey?: string } }>(
    "/v1/calendar/brief",
    async (request, reply) => {
      const meetingKey = request.query.meetingKey;
      if (!meetingKey) {
        return reply.code(400).send({ error: "meetingKey required" });
      }
      try {
        const brief = await getMeetingBrief(
          app.store,
          request.orgId,
          meetingKey,
        );
        return { brief };
      } catch (err) {
        return reply
          .code(404)
          .send({ error: err instanceof Error ? err.message : "not_found" });
      }
    },
  );

  app.post<{ Body: z.infer<typeof followUpBodySchema> }>(
    "/v1/calendar/follow-up",
    async (request, reply) => {
      const parsed = followUpBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body" });
      }
      try {
        const result = await createFollowUpTask(app.store, request.orgId, {
          meetingKey: parsed.data.meetingKey,
          ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
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
};
