import { beforeEach, describe, expect, it, vi } from "vitest";
import { GRAPH_ANCHOR_KEYS } from "./api.js";

vi.mock("./api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api.js")>();
  return {
    ...actual,
    api: vi.fn(),
  };
});

import { api } from "./api.js";
import { loadGraphSnapshot } from "./graph-data.js";

const mockedApi = vi.mocked(api);

function makeNode(
  key: string,
  type: string,
  id = key,
): { _id: string; type: string; key: string; label: string; props: Record<string, never> } {
  return { _id: id, type, key, label: key, props: {} };
}

function makeEdge(
  id: string,
  type: string,
  fromId: string,
  toId: string,
): { _id: string; type: string; fromId: string; toId: string; props: Record<string, never> } {
  return { _id: id, type, fromId, toId, props: {} };
}

describe("loadGraphSnapshot", () => {
  beforeEach(() => {
    mockedApi.mockReset();
  });

  it("merges edges from anchor neighborhoods", async () => {
    const nodes = [
      makeNode("Org:Arka-Atelier", "Org", "n1"),
      makeNode("SalesOrder:SO-218", "SalesOrder", "n2"),
      makeNode("PurchaseOrder:PO-104", "PurchaseOrder", "n3"),
    ];

    mockedApi.mockImplementation(async (path: string) => {
      if (path === "/v1/nodes") return { nodes };
      const anchor = GRAPH_ANCHOR_KEYS.find((k) => path.includes(encodeURIComponent(k)));
      if (!anchor) return { center: nodes[0], nodes: [], edges: [] };
      const idx = GRAPH_ANCHOR_KEYS.indexOf(anchor);
      const edges = Array.from({ length: 4 }, (_, i) =>
        makeEdge(`e-${anchor}-${i}`, "LINK", `n${(idx % 3) + 1}`, `n${((idx + 1) % 3) + 1}`),
      );
      return { center: nodes[idx % nodes.length]!, nodes, edges };
    });

    const snapshot = await loadGraphSnapshot();
    expect(snapshot.edges.length).toBeGreaterThanOrEqual(15);
    expect(snapshot.nodeByKey.get("SalesOrder:SO-218")?.key).toBe("SalesOrder:SO-218");
  });
});
