import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from "d3-force";
import type { GraphSnapshot } from "./graph-data";

function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  return (h & 0x7fffffff) / 0x7fffffff;
}

export function layoutGraph(
  snapshot: GraphSnapshot,
  width: number,
  height: number,
): Map<string, { x: number; y: number }> {
  const nodes = snapshot.nodes.map((n) => ({
    id: n._id,
    x: width / 2 + (hashSeed(n._id) - 0.5) * 40,
    y: height / 2 + (hashSeed(`${n._id}:y`) - 0.5) * 40,
  }));

  const nodeIndex = new Map(nodes.map((n, i) => [n.id, i]));

  const links = snapshot.edges
    .filter((e) => nodeIndex.has(e.fromId) && nodeIndex.has(e.toId))
    .map((e) => ({
      source: nodeIndex.get(e.fromId)!,
      target: nodeIndex.get(e.toId)!,
    }));

  const sim = forceSimulation(nodes)
    .force("link", forceLink(links).distance(90).strength(0.4))
    .force("charge", forceManyBody().strength(-220))
    .force("center", forceCenter(width / 2, height / 2))
    .force("collide", forceCollide(28));

  sim.stop();
  for (let i = 0; i < 300; i++) sim.tick();

  return new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
}
