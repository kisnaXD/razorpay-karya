import type { FastifyPluginAsync } from "fastify";
import type { GraphStore, NodeRecord, NodeType } from "@karya/graph";
import { NODE_TYPES, buildMorningBriefing } from "@karya/graph";

function notFound(reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
  return reply.code(404).send({ error: "not found" });
}

function parseDepth(raw: string | undefined): 1 | 2 | null {
  if (raw === undefined || raw === "") {
    return 1;
  }
  if (raw === "1") {
    return 1;
  }
  if (raw === "2") {
    return 2;
  }
  return null;
}

async function resolveKey(
  store: GraphStore,
  orgId: string,
  key: string,
): Promise<NodeRecord | null> {
  return store.getNodeByKey(orgId, decodeURIComponent(key));
}

async function merchantOrg(
  store: GraphStore,
  orgId: string,
): Promise<NodeRecord | null> {
  const orgs = await store.listNodes(orgId, "Org");
  return orgs.find((n) => n.props.role === "merchant") ?? orgs[0] ?? null;
}

export const graphRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/nodes", async (request) => {
    const orgId = request.orgId;
    const type = (request.query as { type?: string }).type;
    if (type !== undefined && type !== "") {
      if (!NODE_TYPES.includes(type as NodeType)) {
        return { nodes: [] };
      }
      const nodes = await app.store.listNodes(orgId, type as NodeType);
      return { nodes };
    }
    const nodes = await app.store.listNodes(orgId);
    return { nodes };
  });

  app.get<{ Params: { key: string } }>("/v1/nodes/:key", async (request, reply) => {
    const node = await resolveKey(app.store, request.orgId, request.params.key);
    if (!node) {
      return notFound(reply);
    }
    return { node };
  });

  app.get("/v1/neighborhood", async (request, reply) => {
    const { key, depth: depthRaw } = request.query as {
      key?: string;
      depth?: string;
    };
    if (!key) {
      return reply.code(400).send({ error: "key required" });
    }

    const depth = parseDepth(depthRaw);
    if (depth === null) {
      return reply.code(400).send({ error: "depth must be 1 or 2" });
    }

    const center = await app.store.getNodeByKey(request.orgId, key);
    if (!center) {
      return notFound(reply);
    }

    try {
      const result = await app.store.neighborhood(
        request.orgId,
        center._id,
        depth,
      );
      return result;
    } catch {
      return notFound(reply);
    }
  });

  app.get("/v1/path", async (request, reply) => {
    const { from, to } = request.query as { from?: string; to?: string };
    if (!from || !to) {
      return reply.code(400).send({ error: "from and to required" });
    }

    const fromNode = await app.store.getNodeByKey(request.orgId, from);
    const toNode = await app.store.getNodeByKey(request.orgId, to);
    if (!fromNode || !toNode) {
      return { path: null };
    }

    const result = await app.store.path(
      request.orgId,
      fromNode._id,
      toNode._id,
    );
    if (!result) {
      return { path: null };
    }
    return result;
  });

  app.get("/v1/impact", async (request, reply) => {
    const { key } = request.query as { key?: string };
    if (!key) {
      return reply.code(400).send({ error: "key required" });
    }

    const node = await app.store.getNodeByKey(request.orgId, key);
    if (!node) {
      return notFound(reply);
    }

    return app.store.impact(request.orgId, node._id);
  });

  app.get("/v1/exceptions", async (request) => {
    const exceptions = await app.store.exceptions(request.orgId);
    return { exceptions };
  });

  app.get("/v1/inbox", async (request) => {
    const exceptions = await app.store.exceptions(request.orgId);
    const briefing = buildMorningBriefing(exceptions);
    return { exceptions, briefing };
  });

  app.get("/v1/inbox/briefing", async (request) => {
    const exceptions = await app.store.exceptions(request.orgId);
    const briefing = buildMorningBriefing(exceptions);
    return { briefing };
  });

  app.get("/v1/bootstrap", async (request, reply) => {
    const org = await merchantOrg(app.store, request.orgId);
    if (!org) {
      return notFound(reply);
    }

    const exceptions = await app.store.exceptions(request.orgId);
    const cashRaw = org.props.cashInPaise;
    const cashInPaise = typeof cashRaw === "number" ? cashRaw : 0;

    return {
      org,
      exceptionCount: exceptions.length,
      cashInPaise,
    };
  });
};
