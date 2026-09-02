import type { FastifyPluginAsync } from "fastify";
import { getOrgTimeline, listPeopleOrgs } from "../services/people.js";

export const peopleRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/people/orgs", async (request) => {
    const orgs = await listPeopleOrgs(app.store, request.orgId);
    return { orgs };
  });

  app.get<{ Params: { orgKey: string } }>(
    "/v1/people/:orgKey/timeline",
    async (request, reply) => {
      const orgKey = decodeURIComponent(request.params.orgKey);
      try {
        const result = await getOrgTimeline(
          app.store,
          request.orgId,
          orgKey,
        );
        return result;
      } catch (err) {
        return reply
          .code(404)
          .send({ error: err instanceof Error ? err.message : "not_found" });
      }
    },
  );
};
