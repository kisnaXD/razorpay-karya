import type { PolicyRule } from "./rules.js";

export type ProposedAction = {
  action: string;
  orgId: string;
  amountInPaise?: number;
  targetNodeKey?: string;
  explanation: string;
  proposedBy: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type PolicyDecision = "allow" | "deny" | "require_approval";

export type PolicyEvaluationResult = {
  decision: PolicyDecision;
  policyKey: string | null;
  policyLabel: string | null;
  reasons: string[];
  matchedRules: PolicyRule[];
};

export type EvaluateOutcome = {
  finalDecision: PolicyDecision;
  results: PolicyEvaluationResult[];
};
