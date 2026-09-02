import type { Collection, Db } from "mongodb";
import type {
  EdgeRecord,
  EdgeType,
  GraphFilter,
  NodeRecord,
  NodeType,
  Exception,
} from "./types.js";
import { newEdgeId } from "./ids.js";
import { evaluateExceptions } from "./exceptions.js";

const IMPACT_EDGE_TYPES: EdgeType[] = [
  "ORDER_CONTAINS",
  "FULFILLS",
  "SHIPS",
  "INVOICES",
  "PAYS",
  "STOCK_OF",
  "MADE_FROM",
  "HAS_SKU",
  "BUYS",
];

function edgeActiveQuery(orgId: string, filter?: GraphFilter) {
  if (filter?.at) {
    const at = filter.at;
    return {
      orgId,
      validFrom: { $lte: at },
      $or: [{ validTo: null }, { validTo: { $gt: at } }],
    };
  }
  return { orgId, validTo: null };
}

export class GraphStore {
  private readonly nodes: Collection<NodeRecord>;
  private readonly edges: Collection<EdgeRecord>;

  constructor(private readonly db: Db) {
    this.nodes = db.collection<NodeRecord>("nodes");
    this.edges = db.collection<EdgeRecord>("edges");
  }

  async ensureIndexes(): Promise<void> {
    await this.nodes.createIndex({ orgId: 1, key: 1 }, { unique: true });
    await this.nodes.createIndex({ orgId: 1, type: 1 });
    await this.edges.createIndex({ orgId: 1, fromId: 1, validTo: 1 });
    await this.edges.createIndex({ orgId: 1, toId: 1, validTo: 1 });
    await this.edges.createIndex({ orgId: 1, type: 1, validTo: 1 });
  }

  async upsertNode(
    input: Omit<NodeRecord, "createdAt" | "updatedAt">,
  ): Promise<NodeRecord> {
    const now = new Date();
    const existing = await this.nodes.findOne({
      orgId: input.orgId,
      key: input.key,
    });

    if (existing) {
      const updated: NodeRecord = {
        ...existing,
        type: input.type,
        label: input.label,
        props: input.props,
        updatedAt: now,
      };
      await this.nodes.replaceOne({ _id: existing._id }, updated);
      return updated;
    }

    const created: NodeRecord = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    await this.nodes.insertOne(created);
    return created;
  }

  async getNode(orgId: string, id: string): Promise<NodeRecord | null> {
    return this.nodes.findOne({ orgId, _id: id });
  }

  async getNodeByKey(orgId: string, key: string): Promise<NodeRecord | null> {
    return this.nodes.findOne({ orgId, key });
  }

  async listNodes(orgId: string, type?: NodeType): Promise<NodeRecord[]> {
    const query = type ? { orgId, type } : { orgId };
    return this.nodes.find(query).toArray();
  }

  async listEdges(
    orgId: string,
    filter?: GraphFilter,
  ): Promise<EdgeRecord[]> {
    return this.loadActiveEdges(orgId, filter);
  }

  async writeEdge(
    input: Omit<EdgeRecord, "createdAt" | "validTo"> & { validTo?: null },
  ): Promise<EdgeRecord> {
    const now = new Date();
    const existing = await this.edges.findOne({
      orgId: input.orgId,
      type: input.type,
      fromId: input.fromId,
      toId: input.toId,
      validTo: null,
    });

    if (existing) {
      await this.edges.updateOne(
        { _id: existing._id },
        { $set: { validTo: now } },
      );

      const supersedes: EdgeRecord = {
        _id: newEdgeId(),
        orgId: input.orgId,
        type: "SUPERSEDES",
        fromId: input._id,
        toId: existing._id,
        props: {},
        validFrom: now,
        validTo: now,
        createdAt: now,
      };
      await this.edges.insertOne(supersedes);
    }

    const edge: EdgeRecord = {
      _id: input._id,
      orgId: input.orgId,
      type: input.type,
      fromId: input.fromId,
      toId: input.toId,
      props: input.props,
      validFrom: input.validFrom,
      validTo: null,
      createdAt: now,
    };
    await this.edges.insertOne(edge);
    return edge;
  }

  private async loadActiveEdges(
    orgId: string,
    filter?: GraphFilter,
  ): Promise<EdgeRecord[]> {
    return this.edges.find(edgeActiveQuery(orgId, filter)).toArray();
  }

  async neighborhood(
    orgId: string,
    nodeId: string,
    depth: 1 | 2,
    filter?: GraphFilter,
  ): Promise<{
    center: NodeRecord;
    nodes: NodeRecord[];
    edges: EdgeRecord[];
  }> {
    const center = await this.getNode(orgId, nodeId);
    if (!center) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    const allEdges = await this.loadActiveEdges(orgId, filter);
    const visited = new Set<string>([nodeId]);
    let frontier = new Set<string>([nodeId]);

    for (let d = 0; d < depth; d++) {
      const next = new Set<string>();
      for (const edge of allEdges) {
        if (frontier.has(edge.fromId) && !visited.has(edge.toId)) {
          next.add(edge.toId);
        }
        if (frontier.has(edge.toId) && !visited.has(edge.fromId)) {
          next.add(edge.fromId);
        }
      }
      for (const id of next) {
        visited.add(id);
      }
      frontier = next;
    }

    visited.delete(nodeId);
    const nodeIds = [...visited];
    const nodes =
      nodeIds.length === 0
        ? []
        : await this.nodes
            .find({ orgId, _id: { $in: nodeIds } })
            .toArray();

    const nodeSet = new Set([nodeId, ...nodeIds]);
    const edges = allEdges.filter(
      (e) => nodeSet.has(e.fromId) && nodeSet.has(e.toId),
    );

    return { center, nodes, edges };
  }

  async path(
    orgId: string,
    fromId: string,
    toId: string,
    filter?: GraphFilter,
  ): Promise<{ nodes: NodeRecord[]; edges: EdgeRecord[] } | null> {
    if (fromId === toId) {
      const node = await this.getNode(orgId, fromId);
      return node ? { nodes: [node], edges: [] } : null;
    }

    const allEdges = await this.loadActiveEdges(orgId, filter);
    const adjacency = new Map<string, EdgeRecord[]>();

    for (const edge of allEdges) {
      const fromList = adjacency.get(edge.fromId) ?? [];
      fromList.push(edge);
      adjacency.set(edge.fromId, fromList);

      const toList = adjacency.get(edge.toId) ?? [];
      toList.push(edge);
      adjacency.set(edge.toId, toList);
    }

    const queue: string[] = [fromId];
    const prevNode = new Map<string, string>();
    const prevEdge = new Map<string, EdgeRecord>();
    const depth = new Map<string, number>([[fromId, 0]]);
    const seen = new Set<string>([fromId]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDepth = depth.get(current) ?? 0;
      if (currentDepth >= 8) {
        continue;
      }

      for (const edge of adjacency.get(current) ?? []) {
        const neighbor = edge.fromId === current ? edge.toId : edge.fromId;
        if (seen.has(neighbor)) {
          continue;
        }
        seen.add(neighbor);
        prevNode.set(neighbor, current);
        prevEdge.set(neighbor, edge);
        depth.set(neighbor, currentDepth + 1);
        queue.push(neighbor);
      }
    }

    if (!seen.has(toId)) {
      return null;
    }

    const pathNodeIds: string[] = [];
    const pathEdges: EdgeRecord[] = [];
    let cursor: string | undefined = toId;
    while (cursor && cursor !== fromId) {
      pathNodeIds.unshift(cursor);
      const edge = prevEdge.get(cursor);
      if (edge) {
        pathEdges.unshift(edge);
      }
      cursor = prevNode.get(cursor);
    }
    pathNodeIds.unshift(fromId);

    const nodes = await this.nodes
      .find({ orgId, _id: { $in: pathNodeIds } })
      .toArray();
    const order = new Map(pathNodeIds.map((id, i) => [id, i]));
    nodes.sort((a, b) => (order.get(a._id) ?? 0) - (order.get(b._id) ?? 0));

    return { nodes, edges: pathEdges };
  }

  async impact(
    orgId: string,
    nodeId: string,
    filter?: GraphFilter,
  ): Promise<{ nodes: NodeRecord[]; edges: EdgeRecord[] }> {
    const allEdges = await this.loadActiveEdges(orgId, filter);
    const impactEdges = allEdges.filter((e) =>
      IMPACT_EDGE_TYPES.includes(e.type),
    );

    const visited = new Set<string>([nodeId]);
    const queue = [nodeId];
    const collectedEdges: EdgeRecord[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of impactEdges) {
        const touches =
          edge.fromId === current || edge.toId === current;
        if (!touches) {
          continue;
        }
        collectedEdges.push(edge);
        const neighbor =
          edge.fromId === current ? edge.toId : edge.fromId;
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    const nodeIds = [...visited].filter((id) => id !== nodeId);
    const nodes =
      nodeIds.length === 0
        ? []
        : await this.nodes
            .find({ orgId, _id: { $in: nodeIds } })
            .toArray();

    const nodeSet = visited;
    const edges = collectedEdges.filter(
      (e, i, arr) =>
        nodeSet.has(e.fromId) &&
        nodeSet.has(e.toId) &&
        arr.findIndex((x) => x._id === e._id) === i,
    );

    return { nodes, edges };
  }

  async exceptions(orgId: string): Promise<Exception[]> {
    const nodes = await this.listNodes(orgId);
    const edges = await this.loadActiveEdges(orgId);
    return evaluateExceptions(nodes, edges);
  }
}
