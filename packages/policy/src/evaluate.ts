import type { PolicyRule } from "./rules.js";
import type {
  EvaluateOutcome,
  PolicyDecision,
  PolicyEvaluationResult,
  ProposedAction,
} from "./types.js";
import type { CompiledPolicy } from "./rules.js";

export type EvaluationContext = {
  proposed: ProposedAction;
  targetProps: Record<string, string | number | boolean | null> | null;
};

function resolveField(ctx: EvaluationContext, field: string): unknown {
  if (field === "amountInPaise") return ctx.proposed.amountInPaise ?? null;
  if (field.startsWith("target.props.")) {
    const key = field.slice("target.props.".length);
    return ctx.targetProps?.[key] ?? null;
  }
  if (field.startsWith("metadata.")) {
    const key = field.slice("metadata.".length);
    return ctx.proposed.metadata?.[key] ?? null;
  }
  // Direct metadata fields (e.g. isDraft on email.send drafts)
  if (ctx.proposed.metadata && field in ctx.proposed.metadata) {
    return ctx.proposed.metadata[field] ?? null;
  }
  return null;
}

function ruleMatches(ctx: EvaluationContext, rule: PolicyRule): boolean {
  const actual = resolveField(ctx, rule.field);
  switch (rule.op) {
    case "eq":
      return actual === rule.value;
    case "neq":
      return actual !== rule.value;
    case "lte":
      return (
        typeof actual === "number" &&
        typeof rule.value === "number" &&
        actual <= rule.value
      );
    case "gte":
      return (
        typeof actual === "number" &&
        typeof rule.value === "number" &&
        actual >= rule.value
      );
    case "in":
      return (
        Array.isArray(rule.value) && rule.value.includes(String(actual))
      );
    case "truthy":
      return Boolean(actual);
    default:
      return false;
  }
}

export function evaluatePolicy(
  compiled: CompiledPolicy,
  policyKey: string,
  policyLabel: string,
  ctx: EvaluationContext,
): PolicyEvaluationResult | null {
  const failed: PolicyRule[] = [];
  for (const rule of compiled.rules) {
    if (!ruleMatches(ctx, rule)) failed.push(rule);
  }
  if (failed.length > 0) {
    return null;
  }
  return {
    decision: compiled.effect,
    policyKey,
    policyLabel,
    reasons: [compiled.description],
    matchedRules: compiled.rules,
  };
}

export function aggregateDecision(
  results: PolicyEvaluationResult[],
): PolicyDecision {
  if (results.some((r) => r.decision === "deny")) return "deny";
  if (results.some((r) => r.decision === "require_approval"))
    return "require_approval";
  if (results.some((r) => r.decision === "allow")) return "allow";
  return "require_approval";
}

export function evaluateProposedAction(
  policies: Array<{ key: string; label: string; compiled: CompiledPolicy }>,
  ctx: EvaluationContext,
): EvaluateOutcome {
  const results: PolicyEvaluationResult[] = [];
  for (const p of policies) {
    if (p.compiled.action !== ctx.proposed.action) continue;
    const r = evaluatePolicy(p.compiled, p.key, p.label, ctx);
    if (r) results.push(r);
  }
  const finalDecision =
    results.length === 0 ? "require_approval" : aggregateDecision(results);
  const outcome: EvaluateOutcome = {
    finalDecision,
    results:
      results.length === 0
        ? [
            {
              decision: "require_approval",
              policyKey: null,
              policyLabel: null,
              reasons: ["No policy matched"],
              matchedRules: [],
            },
          ]
        : results,
  };
  return outcome;
}
