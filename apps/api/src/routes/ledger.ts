import type { FastifyPluginAsync } from "fastify";
import { getLedger } from "../services/ledger.js";

export const ledgerRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/ledger", async (request) => {
    const summary = await getLedger(app.store, request.orgId);
    return summary;
  });
};
