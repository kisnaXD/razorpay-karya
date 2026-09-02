import { describe, expect, it } from "vitest";
import { parseCompiledPolicy } from "./rules.js";
import { evaluateProposedAction } from "./evaluate.js";
import type { ProposedAction } from "./types.js";

const PAY_VENDOR_POLICY = parseCompiledPolicy(
  JSON.stringify({
    action: "pay.vendor",
    effect: "require_approval",
    description:
      "Vendor payouts up to ₹25,000 require approval; only verified bank accounts.",
    rules: [
      { field: "amountInPaise", op: "lte", value: 2500000 },
      { field: "target.props.verified_bank", op: "truthy" },
    ],
  }),
);

const COLLECT_INVOICE_POLICY = parseCompiledPolicy(
  JSON.stringify({
    action: "collect.invoice",
    effect: "allow",
    description:
      "May send Payment Links autonomously for overdue B2B invoices.",
    rules: [
      {
        field: "target.props.status",
        op: "in",
        value: ["overdue", "sent"],
      },
    ],
  }),
);

const DENY_VENDOR_POLICY = parseCompiledPolicy(
  JSON.stringify({
    action: "pay.vendor",
    effect: "deny",
    description: "Block all vendor payouts over ₹20,000.",
    rules: [{ field: "amountInPaise", op: "gte", value: 2000000 }],
  }),
);

const policies = [
  {
    key: "Policy:pay.vendor",
    label: "Pay vendor policy",
    compiled: PAY_VENDOR_POLICY,
  },
  {
    key: "Policy:collect.invoice",
    label: "Collect invoice policy",
    compiled: COLLECT_INVOICE_POLICY,
  },
];

function ctx(
  proposed: ProposedAction,
  targetProps: Record<string, string | number | boolean | null> | null,
) {
  return { proposed, targetProps };
}

describe("evaluateProposedAction", () => {
  it("pay.vendor ₹20,000 to verified vendor → require_approval", () => {
    const proposed: ProposedAction = {
      action: "pay.vendor",
      orgId: "org_arka",
      amountInPaise: 2000000,
      targetNodeKey: "Org:Meenakshi-Brass",
      explanation: "Pay PO-104 partial",
      proposedBy: "agent:money",
    };
    const outcome = evaluateProposedAction(
      policies,
      ctx(proposed, { verified_bank: true }),
    );
    expect(outcome.finalDecision).toBe("require_approval");
    expect(outcome.results[0]?.policyKey).toBe("Policy:pay.vendor");
  });

  it("pay.vendor ₹30,000 → default require_approval (no match)", () => {
    const proposed: ProposedAction = {
      action: "pay.vendor",
      orgId: "org_arka",
      amountInPaise: 3000000,
      targetNodeKey: "Org:Meenakshi-Brass",
      explanation: "Pay PO-104 partial",
      proposedBy: "agent:money",
    };
    const outcome = evaluateProposedAction(
      policies,
      ctx(proposed, { verified_bank: true }),
    );
    expect(outcome.finalDecision).toBe("require_approval");
    expect(outcome.results[0]?.reasons).toContain("No policy matched");
  });

  it("pay.vendor to unverified vendor → default require_approval", () => {
    const proposed: ProposedAction = {
      action: "pay.vendor",
      orgId: "org_arka",
      amountInPaise: 2000000,
      targetNodeKey: "Org:Meenakshi-Brass",
      explanation: "Pay PO-104 partial",
      proposedBy: "agent:money",
    };
    const outcome = evaluateProposedAction(
      policies,
      ctx(proposed, { verified_bank: false }),
    );
    expect(outcome.finalDecision).toBe("require_approval");
    expect(outcome.results[0]?.reasons).toContain("No policy matched");
  });

  it("collect.invoice on overdue invoice → allow", () => {
    const proposed: ProposedAction = {
      action: "collect.invoice",
      orgId: "org_arka",
      amountInPaise: 1480000,
      targetNodeKey: "Invoice:INV-90",
      explanation: "Payment Link for INV-90",
      proposedBy: "agent:money",
    };
    const outcome = evaluateProposedAction(
      policies,
      ctx(proposed, { status: "overdue", amountInPaise: 1480000 }),
    );
    expect(outcome.finalDecision).toBe("allow");
    expect(outcome.results[0]?.policyKey).toBe("Policy:collect.invoice");
  });

  it("multiple policies: one allow + one deny → deny", () => {
    const proposed: ProposedAction = {
      action: "pay.vendor",
      orgId: "org_arka",
      amountInPaise: 2200000,
      targetNodeKey: "Org:Meenakshi-Brass",
      explanation: "Pay PO-104 partial",
      proposedBy: "agent:money",
    };
    const mixed = [
      ...policies,
      {
        key: "Policy:pay.vendor.deny",
        label: "Deny large payouts",
        compiled: DENY_VENDOR_POLICY,
      },
    ];
    const outcome = evaluateProposedAction(
      mixed,
      ctx(proposed, { verified_bank: true }),
    );
    expect(outcome.finalDecision).toBe("deny");
  });
});
