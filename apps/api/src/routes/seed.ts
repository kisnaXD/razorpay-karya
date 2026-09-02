import type { FastifyPluginAsync } from "fastify";
import { seedArkaAtelier } from "@karya/seed";
import type { Env } from "../env.js";

export const seedRoutes: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  app.post("/v1/admin/seed", async (_request, reply) => {
    if (opts.env.NODE_ENV !== "development") {
      return reply.code(403).send({ error: "seed disabled outside development" });
    }

    const result = await seedArkaAtelier(app.store, app.db);
    return result;
  });
};
