import type { ApiNode } from "./api";

/** Matches GET /v1/neighborhood — GraphStore returns center separately from nodes. */
export type Neighborhood = {
  center: ApiNode;
  nodes: ApiNode[];
  edges?: unknown[];
};

export function neighborhoodKeysFrom(
  neighborhood: Neighborhood | null | undefined,
): Set<string> {
  const keys = new Set<string>();
  if (!neighborhood?.center?.key) return keys;
  keys.add(neighborhood.center.key);
  for (const node of neighborhood.nodes) {
    keys.add(node.key);
  }
  return keys;
}

export function neighborhoodPath(key: string, depth: 1 | 2): string {
  const params = new URLSearchParams({
    key,
    depth: String(depth),
  });
  return `/v1/neighborhood?${params.toString()}`;
}
