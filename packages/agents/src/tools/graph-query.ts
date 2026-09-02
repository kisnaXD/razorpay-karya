import type { EdgeRecord, NodeRecord, NodeType } from "@karya/graph";
import type { ToolContext } from "../types.js";

const IMPORTANT_PROP_KEYS = [
  "status",
  "amount",
  "amountInPaise",
  "qty",
  "quantity",
  "on_hand",
  "onHand",
  "reserved",
  "available",
  "promiseDate",
  "dueDate",
  "expectedAt",
  "role",
  "email",
  "skuKey",
  "uom",
] as const;

function pickImportantProps(props: NodeRecord["props"]) {
  const out: Record<string, string | number | boolean | null> = {};
  for (const key of IMPORTANT_PROP_KEYS) {
    if (key in props) {
      out[key] = props[key] ?? null;
    }
  }
  return out;
}

function serializeNode(node: NodeRecord) {
  return {
    key: node.key,
    type: node.type,
    label: node.label,
    props: node.props,
  };
}

function summarizeEdges(
  edges: EdgeRecord[],
  nodeById: Map<string, NodeRecord>,
) {
  return edges.map((e) => ({
    type: e.type,
    fromKey: nodeById.get(e.fromId)?.key ?? e.fromId,
    toKey: nodeById.get(e.toId)?.key ?? e.toId,
    props: e.props,
  }));
}

export type QueryGraphInput = {
  action: "list_nodes" | "get_node" | "list_edges" | "search" | "neighborhood";
  nodeType?: string;
  nodeKey?: string;
  searchTerm?: string;
  edgeType?: string;
  explanation: string;
};

export async function queryGraph(ctx: ToolContext, input: QueryGraphInput) {
  switch (input.action) {
    case "list_nodes": {
      const type = input.nodeType as NodeType | undefined;
      const nodes = await ctx.store.listNodes(ctx.orgId, type);
      return {
        action: "list_nodes" as const,
        nodeType: type ?? null,
        count: nodes.length,
        nodes: nodes.map(serializeNode),
      };
    }
    case "get_node": {
      if (!input.nodeKey) {
        throw new Error("nodeKey is required for get_node");
      }
      const node = await ctx.store.getNodeByKey(ctx.orgId, input.nodeKey);
      if (!node) {
        throw new Error(`Node not found: ${input.nodeKey}`);
      }
      return {
        action: "get_node" as const,
        node: serializeNode(node),
      };
    }
    case "list_edges": {
      const edges = await ctx.store.listEdges(ctx.orgId);
      const filtered = input.edgeType
        ? edges.filter((e) => e.type === input.edgeType)
        : edges;
      const nodes = await ctx.store.listNodes(ctx.orgId);
      const byId = new Map(nodes.map((n) => [n._id, n]));
      return {
        action: "list_edges" as const,
        edgeType: input.edgeType ?? null,
        count: filtered.length,
        edges: summarizeEdges(filtered, byId),
      };
    }
    case "search": {
      if (!input.searchTerm) {
        throw new Error("searchTerm is required for search");
      }
      const term = input.searchTerm.toLowerCase();
      const nodes = await ctx.store.listNodes(ctx.orgId);
      const matches = nodes.filter(
        (n) =>
          n.key.toLowerCase().includes(term) ||
          n.label.toLowerCase().includes(term),
      );
      return {
        action: "search" as const,
        searchTerm: input.searchTerm,
        count: matches.length,
        nodes: matches.map(serializeNode),
      };
    }
    case "neighborhood": {
      if (!input.nodeKey) {
        throw new Error("nodeKey is required for neighborhood");
      }
      const center = await ctx.store.getNodeByKey(ctx.orgId, input.nodeKey);
      if (!center) {
        throw new Error(`Node not found: ${input.nodeKey}`);
      }
      const hood = await ctx.store.neighborhood(ctx.orgId, center._id, 2);
      const allNodes = [hood.center, ...hood.nodes];
      const byId = new Map(allNodes.map((n) => [n._id, n]));
      return {
        action: "neighborhood" as const,
        center: serializeNode(hood.center),
        nodes: hood.nodes.map(serializeNode),
        edges: summarizeEdges(hood.edges, byId),
      };
    }
  }
}

export async function listAllData(ctx: ToolContext) {
  const nodes = await ctx.store.listNodes(ctx.orgId);
  const grouped = new Map<string, NodeRecord[]>();

  for (const node of nodes) {
    const list = grouped.get(node.type) ?? [];
    list.push(node);
    grouped.set(node.type, list);
  }

  const byType = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, typeNodes]) => ({
      type,
      count: typeNodes.length,
      nodes: typeNodes.map((n) => ({
        key: n.key,
        label: n.label,
        ...pickImportantProps(n.props),
      })),
    }));

  return {
    totalNodes: nodes.length,
    typeCount: byType.length,
    byType,
  };
}
