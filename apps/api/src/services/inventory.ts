import type { GraphStore } from "@karya/graph";
import {
  promiseQuery,
  type PromiseQueryInput,
  type PromiseQueryResult,
} from "@karya/agents";

export async function runPromiseQuery(
  store: GraphStore,
  orgId: string,
  input: Omit<PromiseQueryInput, "orgId">,
): Promise<PromiseQueryResult> {
  return promiseQuery(
    { orgId, ...input },
    async () => {
      const nodes = await store.listNodes(orgId);
      const edges = await store.listEdges(orgId);
      return { nodes, edges };
    },
    (key) => store.getNodeByKey(orgId, key),
  );
}
