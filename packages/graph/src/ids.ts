import { ulid } from "ulid";

export function newNodeId(): string {
  return `node_${ulid()}`;
}

export function newEdgeId(): string {
  return `edge_${ulid()}`;
}

export function newExceptionId(code: string, nodeId: string): string {
  return `exc_${code}_${nodeId}`;
}
