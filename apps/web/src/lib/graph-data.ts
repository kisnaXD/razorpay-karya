import {
  api,
  GRAPH_ANCHOR_KEYS,
  neighborhoodPath,
  type ApiEdge,
  type ApiNodeFull,
} from "./api";

export type GraphSnapshot = {
  nodes: ApiNodeFull[];
  edges: ApiEdge[];
  nodeById: Map<string, ApiNodeFull>;
  nodeByKey: Map<string, ApiNodeFull>;
};

export async function loadGraphSnapshot(): Promise<GraphSnapshot> {
  const [{ nodes }, ...neighborhoods] = await Promise.all([
    api<{ nodes: ApiNodeFull[] }>("/v1/nodes"),
    ...GRAPH_ANCHOR_KEYS.map((key) =>
      api<{
        center: ApiNodeFull;
        nodes: ApiNodeFull[];
        edges: ApiEdge[];
      }>(neighborhoodPath(key, 2)).catch(() => null),
    ),
  ]);

  const edgeMap = new Map<string, ApiEdge>();
  for (const hood of neighborhoods) {
    if (!hood?.edges) continue;
    for (const edge of hood.edges) {
      edgeMap.set(edge._id, edge);
    }
  }

  const nodeById = new Map(nodes.map((n) => [n._id, n]));
  const nodeByKey = new Map(nodes.map((n) => [n.key, n]));

  return {
    nodes,
    edges: [...edgeMap.values()],
    nodeById,
    nodeByKey,
  };
}
