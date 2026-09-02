import Fastify from "fastify";
import cors from "@fastify/cors";
import type { Db } from "mongodb";
import type { GraphStore } from "@karya/graph";
import type { Env } from "./env.js";
import { healthRoutes } from "./routes/health.js";
import { graphRoutes } from "./routes/graph.js";
import { seedRoutes } from "./routes/seed.js";
import { paymentLinksRoutes } from "./routes/payment-links.js";
import { auditRoutes } from "./routes/audit.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { policiesRoutes } from "./routes/policies.js";
import { approvalsRoutes } from "./routes/approvals.js";
import { inventoryRoutes } from "./routes/inventory.js";
import { salesRoutes } from "./routes/sales.js";
import { agentRoutes } from "./routes/agent.js";
import { agentMemoryRoutes } from "./routes/agent-memory.js";
import { agentEventsRoutes } from "./routes/agent-events.js";
import { a2aRoutes } from "./routes/a2a.js";
import { adminRoutes } from "./routes/admin.js";
import { ledgerRoutes } from "./routes/ledger.js";
import { agentsMoneyRoutes } from "./routes/agents.js";
import { sourcingRoutes } from "./routes/sourcing.js";
import { calendarRoutes } from "./routes/calendar.js";
import { listingsRoutes } from "./routes/listings.js";
import { commsRoutes } from "./routes/comms.js";
import { peopleRoutes } from "./routes/people.js";
import { workOrdersRoutes } from "./routes/work-orders.js";
import { bomsRoutes } from "./routes/boms.js";
import { usersRoutes } from "./routes/users.js";
import { dashboardRoutes } from "./routes/dashboard.js";

declare module "fastify" {
  interface FastifyInstance {
    store: GraphStore;
    db: Db;
  }

  interface FastifyRequest {
    orgId: string;
  }
}

export type BuildAppOptions = {
  store: GraphStore;
  db: Db;
  env: Env;
  logger?: boolean;
};

export async function buildApp({ store, db, env, logger = true }: BuildAppOptions) {
  const app = Fastify({
    logger: logger ? { level: "info" } : false,
  });

  app.decorate("store", store);
  app.decorate("db", db);

  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body, done) => {
      if (req.url.startsWith("/v1/webhooks/razorpay")) {
        done(null, body);
        return;
      }
      try {
        done(null, JSON.parse(body.toString()));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  await app.register(cors, {
    origin: env.WEB_ORIGIN.includes(",")
      ? env.WEB_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)
      : env.WEB_ORIGIN,
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
    await scoped.register(paymentLinksRoutes, { env });
    await scoped.register(auditRoutes);
    await scoped.register(policiesRoutes);
    await scoped.register(approvalsRoutes, { env });
    await scoped.register(inventoryRoutes);
    await scoped.register(salesRoutes);
    await scoped.register(agentRoutes, { env });
    await scoped.register(agentMemoryRoutes);
    await scoped.register(agentEventsRoutes);
    await scoped.register(adminRoutes, { env, store });
    await scoped.register(ledgerRoutes);
    await scoped.register(agentsMoneyRoutes, { env });
    await scoped.register(sourcingRoutes, { env });
    await scoped.register(calendarRoutes);
    await scoped.register(listingsRoutes);
    await scoped.register(commsRoutes, { env });
    await scoped.register(peopleRoutes);
    await scoped.register(bomsRoutes);
    await scoped.register(workOrdersRoutes);
    await scoped.register(usersRoutes);
    await scoped.register(dashboardRoutes);
  });

  await app.register(a2aRoutes, { env, store, db });
  await app.register(webhookRoutes, { env, store });

  return app;
}
