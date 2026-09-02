import type { EdgeRecord, NodeRecord } from "@karya/graph";
import type { ToolContext } from "../types.js";

function summarizeNodes(nodes: NodeRecord[]) {
  return nodes.map((n) => ({ key: n.key, type: n.type, label: n.label }));
}

function summarizeEdges(
  edges: EdgeRecord[],
  nodeById: Map<string, NodeRecord>,
) {
  return edges.map((e) => ({
    type: e.type,
    fromKey: nodeById.get(e.fromId)?.key ?? e.fromId,
    toKey: nodeById.get(e.toId)?.key ?? e.toId,
  }));
}

function indexNodes(nodes: NodeRecord[]) {
  return new Map(nodes.map((n) => [n._id, n]));
}

export async function graphGetNeighborhood(
  ctx: ToolContext,
  input: { nodeKey: string; depth: 1 | 2 },
) {
  const center = await ctx.store.getNodeByKey(ctx.orgId, input.nodeKey);
  if (!center) throw new Error(`Node not found: ${input.nodeKey}`);
  const hood = await ctx.store.neighborhood(ctx.orgId, center._id, input.depth);
  const allNodes = [hood.center, ...hood.nodes];
  const byId = indexNodes(allNodes);
  return {
    center: { key: hood.center.key, type: hood.center.type, label: hood.center.label },
    nodes: summarizeNodes(hood.nodes),
    edges: summarizeEdges(hood.edges, byId),
  };
}

export async function graphFindPath(
  ctx: ToolContext,
  input: { fromKey: string; toKey: string },
) {
  const from = await ctx.store.getNodeByKey(ctx.orgId, input.fromKey);
  const to = await ctx.store.getNodeByKey(ctx.orgId, input.toKey);
  if (!from) throw new Error(`Node not found: ${input.fromKey}`);
  if (!to) throw new Error(`Node not found: ${input.toKey}`);
  const result = await ctx.store.path(ctx.orgId, from._id, to._id);
  if (!result) return { found: false as const, nodes: [], edges: [] };
  const byId = indexNodes(result.nodes);
  return {
    found: true as const,
    nodes: summarizeNodes(result.nodes),
    edges: summarizeEdges(result.edges, byId),
  };
}

export async function graphGetImpact(
  ctx: ToolContext,
  input: { nodeKey: string },
) {
  const center = await ctx.store.getNodeByKey(ctx.orgId, input.nodeKey);
  if (!center) throw new Error(`Node not found: ${input.nodeKey}`);
  const impact = await ctx.store.impact(ctx.orgId, center._id);
  const allNodes = [center, ...impact.nodes];
  const byId = indexNodes(allNodes);
  return {
    center: { key: center.key, type: center.type, label: center.label },
    nodes: summarizeNodes(impact.nodes),
    edges: summarizeEdges(impact.edges, byId),
  };
}

export async function graphListExceptions(ctx: ToolContext) {
  const exceptions = await ctx.store.exceptions(ctx.orgId);
  const nodes = await ctx.store.listNodes(ctx.orgId);
  const byId = indexNodes(nodes);
  return {
    exceptions: exceptions.map((ex) => ({
      id: ex.id,
      severity: ex.severity,
      code: ex.code,
      nodeKey: byId.get(ex.nodeId)?.key ?? ex.nodeId,
      title: ex.title,
      detail: ex.detail,
    })),
  };
}
