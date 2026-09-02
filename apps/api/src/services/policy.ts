import type { GraphStore, NodeRecord } from "@karya/graph";
import {
  evaluateProposedAction,
  parseCompiledPolicy,
  type CompiledPolicy,
  type EvaluateOutcome,
  type PolicyDecision,
  type ProposedAction,
} from "@karya/policy";

export const AUTHORITY_ACTIONS = [
  {
    action: "po.create",
    label: "Create Purchase Order",
    description: "Create purchase orders for materials and supplies",
    preferKeys: ["Policy:PO-Auto-Under-50k", "Policy:PO-Approve-Over-5L"],
  },
  {
    action: "collect.invoice",
    label: "Create Payment Link",
    description: "Generate Razorpay payment links for invoices",
    preferKeys: ["Policy:Payment-Link-Approval"],
  },
  {
    action: "pay.vendor",
    label: "Vendor Payout",
    description: "Process payments to vendors and suppliers",
    preferKeys: ["Policy:Payout-Approval"],
  },
  {
    action: "email.send",
    label: "Send Email",
    description: "Send emails to customers and vendors",
    preferKeys: ["Policy:email.send"],
  },
  {
    action: "listing.publish",
    label: "Publish Listing",
    description: "Publish product listings to marketplace",
    preferKeys: ["Policy:listing.publish"],
  },
  {
    action: "so.accept",
    label: "Accept Sales Order",
    description: "Accept incoming sales orders",
    preferKeys: ["Policy:so.accept"],
  },
] as const;

export type AuthorityActionRow = {
  action: string;
  label: string;
  currentEffect: PolicyDecision;
  threshold?: string;
  policyKey?: string;
  description: string;
};

function formatThresholdAmount(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function formatThreshold(
  rules: CompiledPolicy["rules"],
): string | undefined {
  const amountRule = rules.find((r) => r.field === "amountInPaise");
  if (!amountRule || typeof amountRule.value !== "number") return undefined;
  const amount = formatThresholdAmount(amountRule.value);
  if (amountRule.op === "lte") return `under ${amount}`;
  if (amountRule.op === "gte") return `over ${amount}`;
  return amount;
}

export async function getAuthorityOverview(
  store: GraphStore,
  orgId: string,
): Promise<{ actions: AuthorityActionRow[] }> {
  const policies = await loadPolicies(store, orgId);
  const byKey = new Map(policies.map((p) => [p.key, p]));
  const actions: AuthorityActionRow[] = [];

  for (const def of AUTHORITY_ACTIONS) {
    const preferred = def.preferKeys
      .map((key) => byKey.get(key))
      .filter((p): p is NonNullable<typeof p> => p != null);

    const matching =
      preferred.length > 0
        ? preferred
        : policies.filter((p) => p.compiled.action === def.action);

    if (matching.length === 0) {
      actions.push({
        action: def.action,
        label: def.label,
        currentEffect: "require_approval",
        description: def.description,
      });
      continue;
    }

    for (const p of matching) {
      const threshold = formatThreshold(p.compiled.rules);
      const usePolicyLabel = matching.length > 1 || Boolean(threshold);
      actions.push({
        action: def.action,
        label: usePolicyLabel ? p.label : def.label,
        currentEffect: p.compiled.effect,
        policyKey: p.key,
        description: usePolicyLabel
          ? p.compiled.description
          : def.description,
        ...(threshold ? { threshold } : {}),
      });
    }
  }

  return { actions };
}

export async function updateAuthorityEffect(
  store: GraphStore,
  orgId: string,
  key: string,
  effect: PolicyDecision,
): Promise<NodeRecord> {
  const node = await store.getNodeByKey(orgId, key);
  if (!node || node.type !== "Policy") {
    throw new PolicyNotFoundError(key);
  }
  const compiled = parseCompiledPolicy(String(node.props.rules_json));
  const next = { ...compiled, effect };
  return store.upsertNode({
    ...node,
    props: {
      ...node.props,
      rules_json: JSON.stringify(next),
    },
  });
}

export async function listAllPolicies(
  store: GraphStore,
  orgId: string,
): Promise<
  Array<{
    key: string;
    label: string;
    node: NodeRecord;
    compiled: CompiledPolicy | null;
    enabled: boolean;
  }>
> {
  const nodes = await store.listNodes(orgId, "Policy");
  return nodes.map((n) => {
    let compiled: CompiledPolicy | null = null;
    try {
      compiled = parseCompiledPolicy(String(n.props.rules_json));
    } catch {
      /* skip invalid */
    }
    return {
      key: n.key,
      label: n.label,
      node: n,
      compiled,
      enabled: n.props.enabled !== false,
    };
  });
}

export async function loadPolicies(
  store: GraphStore,
  orgId: string,
): Promise<
  Array<{ key: string; label: string; compiled: CompiledPolicy; node: NodeRecord }>
> {
  const nodes = await store.listNodes(orgId, "Policy");
  const results: Array<{
    key: string;
    label: string;
    compiled: CompiledPolicy;
    node: NodeRecord;
  }> = [];
  for (const n of nodes) {
    if (n.props.enabled === false) continue;
    try {
      const compiled = parseCompiledPolicy(String(n.props.rules_json));
      results.push({ key: n.key, label: n.label, node: n, compiled });
    } catch {
      console.warn(`Skipping malformed policy: ${n.key}`);
    }
  }
  return results;
}

export async function evaluateAction(
  store: GraphStore,
  orgId: string,
  proposed: ProposedAction,
): Promise<EvaluateOutcome> {
  let targetProps: Record<string, string | number | boolean | null> | null =
    null;
  if (proposed.targetNodeKey) {
    const target = await store.getNodeByKey(orgId, proposed.targetNodeKey);
    targetProps = target?.props ?? null;
  }
  const policies = await loadPolicies(store, orgId);
  return evaluateProposedAction(policies, { proposed, targetProps });
}

export async function togglePolicy(
  store: GraphStore,
  orgId: string,
  key: string,
  enabled: boolean,
): Promise<NodeRecord> {
  const node = await store.getNodeByKey(orgId, key);
  if (!node || node.type !== "Policy") {
    throw new PolicyNotFoundError(key);
  }
  return store.upsertNode({
    ...node,
    props: { ...node.props, enabled },
  });
}

export class PolicyNotFoundError extends Error {
  constructor(key: string) {
    super(`Policy not found: ${key}`);
    this.name = "PolicyNotFoundError";
  }
}
