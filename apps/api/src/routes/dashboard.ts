import type { FastifyPluginAsync } from "fastify";
import { computeAgentKpis } from "@karya/agents";

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/dashboard/agent-kpis", async (request) => {
    const result = await computeAgentKpis(app.store, request.orgId);
    return result;
  });
};
