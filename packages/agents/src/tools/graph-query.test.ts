import { describe, expect, it, vi } from "vitest";
import type { NodeRecord } from "@karya/graph";
import type { ToolContext } from "../types.js";
import { listAllData, queryGraph } from "./graph-query.js";

function node(
  partial: Pick<NodeRecord, "key" | "type" | "label"> &
    Partial<Pick<NodeRecord, "_id" | "props">>,
): NodeRecord {
  return {
    _id: partial._id ?? `id_${partial.key}`,
    orgId: "org_1",
    key: partial.key,
    type: partial.type,
    label: partial.label,
    props: partial.props ?? {},
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

function mockCtx(nodes: NodeRecord[]): ToolContext {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  return {
    orgId: "org_1",
    store: {
      listNodes: vi.fn(async (_orgId: string, type?: string) =>
        type ? nodes.filter((n) => n.type === type) : nodes,
      ),
      getNodeByKey: vi.fn(async (_orgId: string, key: string) =>
        byKey.get(key) ?? null,
      ),
      listEdges: vi.fn(async () => [
        {
          _id: "e1",
          orgId: "org_1",
          type: "STOCK_OF",
          fromId: "id_Stock:1",
          toId: "id_SKU:Diya-Large",
          props: {},
          validFrom: new Date(),
          validTo: null,
          createdAt: new Date(),
        },
      ]),
      neighborhood: vi.fn(async () => ({
        center: byKey.get("SKU:Diya-Large")!,
        nodes: [byKey.get("Stock:1")!],
        edges: [
          {
            _id: "e1",
            orgId: "org_1",
            type: "STOCK_OF",
            fromId: "id_Stock:1",
            toId: "id_SKU:Diya-Large",
            props: {},
            validFrom: new Date(),
            validTo: null,
            createdAt: new Date(),
          },
        ],
      })),
    } as unknown as ToolContext["store"],
    evaluateAction: vi.fn(),
    createApproval: vi.fn(),
    createPaymentLink: vi.fn(),
    writeAudit: vi.fn(),
    promiseQuery: vi.fn(),
    getOrderBook: vi.fn(),
    generateQuote: vi.fn(),
    acceptSalesOrder: vi.fn(),
    rejectSalesOrder: vi.fn(),
  };
}

const sampleNodes = [
  node({
    key: "SKU:Diya-Large",
    type: "SKU",
    label: "Diya Large",
    props: { status: "active" },
  }),
  node({
    key: "Stock:1",
    type: "Stock",
    label: "Diya Large stock",
    props: { on_hand: 40, reserved: 5, available: 35 },
  }),
  node({
    key: "Org:Shree-Metal-Works",
    type: "Org",
    label: "Shree Metal Works",
    props: { role: "vendor" },
  }),
];

describe("queryGraph", () => {
  it("lists nodes by type with props", async () => {
    const ctx = mockCtx(sampleNodes);
    const result = await queryGraph(ctx, {
      action: "list_nodes",
      nodeType: "SKU",
      explanation: "List all SKUs for inventory review",
    });
    expect(result.count).toBe(1);
    expect(result.nodes[0]).toEqual({
      key: "SKU:Diya-Large",
      type: "SKU",
      label: "Diya Large",
      props: { status: "active" },
    });
  });

  it("gets a node by key", async () => {
    const ctx = mockCtx(sampleNodes);
    const result = await queryGraph(ctx, {
      action: "get_node",
      nodeKey: "SKU:Diya-Large",
      explanation: "Load Diya Large SKU details",
    });
    expect(result).toMatchObject({
      action: "get_node",
      node: { key: "SKU:Diya-Large", props: { status: "active" } },
    });
  });

  it("searches by label case-insensitively", async () => {
    const ctx = mockCtx(sampleNodes);
    const result = await queryGraph(ctx, {
      action: "search",
      searchTerm: "shree",
      explanation: "Find vendor named Shree",
    });
    expect(result.count).toBe(1);
    expect(result.nodes[0]?.key).toBe("Org:Shree-Metal-Works");
  });

  it("returns neighborhood with related nodes", async () => {
    const ctx = mockCtx(sampleNodes);
    const result = await queryGraph(ctx, {
      action: "neighborhood",
      nodeKey: "SKU:Diya-Large",
      explanation: "Related nodes for Diya Large",
    });
    expect(result).toMatchObject({
      action: "neighborhood",
      center: { key: "SKU:Diya-Large" },
    });
    expect(result.nodes).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({
      type: "STOCK_OF",
      fromKey: "Stock:1",
      toKey: "SKU:Diya-Large",
    });
  });
});

describe("listAllData", () => {
  it("groups nodes by type with important props", async () => {
    const ctx = mockCtx(sampleNodes);
    const result = await listAllData(ctx);
    expect(result.totalNodes).toBe(3);
    expect(result.typeCount).toBe(3);
    const stock = result.byType.find((g) => g.type === "Stock");
    expect(stock?.count).toBe(1);
    expect(stock?.nodes[0]).toMatchObject({
      key: "Stock:1",
      label: "Diya Large stock",
      on_hand: 40,
      available: 35,
    });
  });
});
