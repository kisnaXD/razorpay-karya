import Fastify from "fastify";
import cors from "@fastify/cors";
import type { GraphStore } from "@karya/graph";
import type { Env } from "./env.js";
import { healthRoutes } from "./routes/health.js";
import { graphRoutes } from "./routes/graph.js";
import { seedRoutes } from "./routes/seed.js";

declare module "fastify" {
  interface FastifyInstance {
    store: GraphStore;
  }

  interface FastifyRequest {
    orgId: string;
  }
}

export type BuildAppOptions = {
  store: GraphStore;
  env: Env;
  logger?: boolean;
};

export async function buildApp({ store, env, logger = true }: BuildAppOptions) {
  const app = Fastify({
    logger: logger ? { level: "info" } : false,
  });

  app.decorate("store", store);

  await app.register(cors, {
    origin: env.WEB_ORIGIN,
  });

  await app.register(healthRoutes);

  await app.register(async (scoped) => {
    scoped.addHook("preHandler", async (request, reply) => {
      const orgId = request.headers["x-org-id"];
      if (typeof orgId !== "string" || orgId.length === 0) {
        return reply.code(400).send({ error: "x-org-id required" });
      }
      request.orgId = orgId;
    });

    await scoped.register(graphRoutes);
    await scoped.register(seedRoutes, { env });
  });

  return app;
}
