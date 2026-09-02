import type { FastifyPluginAsync } from "fastify";
import {
  acknowledgeEvents,
  getUnacknowledgedEvents,
} from "../services/agent-events.js";

export const agentEventsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/agent/events", async (request) => {
    return getUnacknowledgedEvents(app.db, request.orgId);
  });

  app.post("/v1/agent/events/ack", async (request) => {
    const acknowledged = await acknowledgeEvents(app.db, request.orgId);
    return { acknowledged };
  });
};
