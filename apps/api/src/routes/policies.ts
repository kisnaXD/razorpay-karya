import type { FastifyPluginAsync } from "fastify";
import type { PolicyDecision, ProposedAction } from "@karya/policy";
import {
  evaluateAction,
  getAuthorityOverview,
  listAllPolicies,
  PolicyNotFoundError,
  togglePolicy,
  updateAuthorityEffect,
} from "../services/policy.js";

const EFFECTS = new Set<PolicyDecision>([
  "allow",
  "require_approval",
  "deny",
]);

export const policiesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/policies", async (request) => {
    const policies = await listAllPolicies(app.store, request.orgId);
    return {
      policies: policies.map(({ node, compiled, enabled }) => ({
        node,
        compiled,
        enabled,
      })),
    };
  });

  app.get("/v1/policies/authority", async (request) => {
    return getAuthorityOverview(app.store, request.orgId);
  });

  app.put<{
    Params: { key: string };
    Body: { effect: PolicyDecision };
  }>("/v1/policies/:key/authority", async (request, reply) => {
    const key = decodeURIComponent(request.params.key);
    const { effect } = request.body ?? {};
    if (!EFFECTS.has(effect)) {
      return reply
        .code(400)
        .send({ error: "effect must be allow | require_approval | deny" });
    }
    try {
      const node = await updateAuthorityEffect(
        app.store,
        request.orgId,
        key,
        effect,
      );
      return { node };
    } catch (err) {
      if (err instanceof PolicyNotFoundError) {
        return reply.code(404).send({ error: "policy_not_found" });
      }
      throw err;
    }
  });

  app.post<{ Body: { proposedAction: ProposedAction } }>(
    "/v1/policies/evaluate",
    async (request, reply) => {
      const { proposedAction } = request.body ?? {};
      if (!proposedAction?.action) {
        return reply.code(400).send({ error: "proposedAction required" });
      }
      const evaluation = await evaluateAction(
        app.store,
        request.orgId,
        proposedAction,
      );
      return { evaluation };
    },
  );

  app.post<{ Params: { key: string }; Body: { enabled: boolean } }>(
    "/v1/policies/:key/toggle",
    async (request, reply) => {
      const key = decodeURIComponent(request.params.key);
      const { enabled } = request.body ?? {};
      if (typeof enabled !== "boolean") {
        return reply.code(400).send({ error: "enabled boolean required" });
      }
      try {
        const node = await togglePolicy(
          app.store,
          request.orgId,
          key,
          enabled,
        );
        return { node };
      } catch (err) {
        if (err instanceof PolicyNotFoundError) {
          return reply.code(404).send({ error: "policy_not_found" });
        }
        throw err;
      }
    },
  );
};
