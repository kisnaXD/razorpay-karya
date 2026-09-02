# Karya Step 4 — Policy Engine & Approval Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make seeded `Policy` nodes functional via a `packages/policy` evaluation engine, surface **Approval cards** in the agent rail, add a **Policy Studio** canvas view, and expose policy/approval API routes. Every proposed money action returns `allow | deny | require_approval` before execution — this is the governance layer agents will call in Step 5+.

**Architecture:** Policies live as graph nodes (compiled JSON in `props.rules_json`). Evaluations are pure functions in `packages/policy`. Approvals persist in Mongo `approvals` collection (short-lived workflow state); resolutions write `Event` audit nodes + optional graph mutations. Web UI adds Policy Studio nav item and renders ApprovalCard in AgentRail when pending approvals exist.

**Tech Stack:** TypeScript 5.8 strict, Zod 3 for rule schemas, Fastify 5, MongoDB native driver (approvals collection), Vitest, existing `@karya/graph`, `@karya/tokens`, Step 2 console routing patterns.

## Global Constraints

From spec §7.3, §8.12, §9.2 and Steps 1–3.

- **Policy nodes are the source of truth** for rules. Do not hardcode limits only in TypeScript — engine reads graph Policy nodes.
- **Evaluation runs before side effects**, not after. API routes that mutate money (e.g. payment links from Step 3) must call policy check when `actor` is an agent; human-initiated API calls in Step 4 still log but may bypass require_approval (locked: human POST `/v1/payment-links` → evaluate for audit only, always proceeds if Razorpay succeeds; agent-proposed actions use `/v1/approvals` flow).
- **Three outcomes only:** `allow`, `deny`, `require_approval`. No fourth state.
- **Approval card is the signature UI** (spec §5.5): copper left edge, title, amount mono, why paragraph, policy name, Approve / Edit / Reject.
- **Mandate chip** (teal/copper pill) shown on allowed automated actions in Policy Studio history — static format this step.
- No Governor agent, no tool loop. Approvals created via API (simulate agent proposals with curl / test fixtures).
- UI tokens unchanged. No shadcn.
- Seed policies `Policy:pay.vendor` and `Policy:collect.invoice` must be upgraded with `rules_json` and `enabled` props — migration in seed upsert (idempotent).

---

## File structure (this step creates / modifies)

```
packages/policy/package.json
packages/policy/tsconfig.json
packages/policy/src/index.ts
packages/policy/src/types.ts
packages/policy/src/rules.ts              Zod schemas for compiled rules
packages/policy/src/evaluate.ts           core engine
packages/policy/src/evaluate.test.ts
packages/policy/src/actions.ts            action catalog constants
packages/seed/src/arka.ts                 enrich Policy nodes (modify)
apps/api/package.json                     add @karya/policy
apps/api/src/env.ts                       unchanged
apps/api/src/mongo.ts                     approvals collection + indexes (modify)
apps/api/src/app.ts                       register routes (modify)
apps/api/src/routes/policies.ts
apps/api/src/routes/approvals.ts
apps/api/src/services/policy.ts           load policies from graph + evaluate
apps/api/src/services/approvals.ts        CRUD + resolve
apps/api/src/test/policies.test.ts
apps/api/src/test/approvals.test.ts
apps/web/src/lib/api.ts                   policy + approval types (modify)
apps/web/src/lib/console-context.tsx      add policy view (modify)
apps/web/src/components/shell/NavRail.tsx add Policy Studio icon slot OR reuse Listings slot — locked: add 9th nav "Policy" disabled in step 2; enable Policy at index after Money
apps/web/src/components/shell/icons.tsx   IconPolicy shield (modify)
apps/web/src/components/agent/ApprovalCard.tsx
apps/web/src/components/agent/ApprovalCardList.tsx
apps/web/src/components/agent/MandateChip.tsx
apps/web/src/components/shell/AgentRail.tsx (modify)
apps/web/src/components/policy/PolicyStudio.tsx
apps/web/src/components/Console.tsx      route policy view (modify)
apps/web/src/components/agent/ApprovalCard.test.tsx
```

**Nav decision (locked):** Replace disabled **Listings** slot visibility — keep 8 icons. Map **Money** nav to `policy` view label "Policy" with shield icon? **No** — spec lists Policy Studio separately. **Locked approach:** Enable **Money** nav item as **Policy Studio** for Step 4 (money governance), retitle tooltip to "Policy". Money ledger UI comes Step 7. Icon stays `IconMoney` or swap to `IconPolicy` — use `IconPolicy` (shield) with label "Policy".

---

## Policy compiled format (locked)

Stored in Policy node `props.rules_json` (stringified JSON).

```ts
export type PolicyRule = {
  field: string;       // dot path on ProposedAction context
  op: "eq" | "neq" | "lte" | "gte" | "in" | "truthy";
  value?: string | number | boolean | string[];
};

export type CompiledPolicy = {
  action: string;      // e.g. "pay.vendor", "collect.invoice"
  effect: "allow" | "deny" | "require_approval";
  rules: PolicyRule[];
  description: string; // plain language for UI
};
```

Seed values (must match spec §7.3):

**Policy:pay.vendor**

```json
{
  "action": "pay.vendor",
  "effect": "require_approval",
  "description": "Vendor payouts up to ₹25,000 require approval; only verified bank accounts.",
  "rules": [
    { "field": "amountInPaise", "op": "lte", "value": 2500000 },
    { "field": "target.props.verified_bank", "op": "truthy" }
  ]
}
```

**Policy:collect.invoice**

```json
{
  "action": "collect.invoice",
  "effect": "allow",
  "description": "May send Payment Links autonomously for overdue B2B invoices.",
  "rules": [
    { "field": "target.props.status", "op": "in", "value": ["overdue", "sent"] }
  ]
}
```

Additional props on Policy nodes:

- `enabled: boolean` (default true)
- `action: string` (duplicate of compiled.action for indexing)

---

## ProposedAction and evaluation result (locked)

```ts
export type ProposedAction = {
  action: string;
  orgId: string;
  amountInPaise?: number;
  targetNodeKey?: string;
  explanation: string;        // required "why"
  proposedBy: string;         // "agent:money" | "human:anika@arka.atelier"
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
```

Evaluation algorithm:

1. Load all `Policy` nodes where `props.enabled !== false` and `props.action === proposedAction.action` (or compiled.action match).
2. For each policy, evaluate all rules (AND). If any rule fails → policy does not match.
3. If policy matches → candidate effect = policy.effect.
4. Aggregate: **any `deny` → final `deny`**. Else **any `require_approval` → final `require_approval`**. Else **any `allow` → final `allow`**. Else **final `require_approval`** (default safe).
5. If no policies match → **final `require_approval`** with reason `"No policy matched"`.

Rule field resolution:

- `amountInPaise` → from ProposedAction
- `target.props.X` → load target node by key from GraphStore, read props
- `target.props.verified_bank` truthy → boolean true

---

## Approval record (Mongo)

Collection: `approvals`

```ts
export type ApprovalStatus = "pending" | "approved" | "rejected" | "edited";

export type ApprovalRecord = {
  _id: string;
  orgId: string;
  status: ApprovalStatus;
  proposedAction: ProposedAction;
  evaluation: EvaluateOutcome;
  why: string;               // copy of explanation for card
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
};
```

Indexes: `{ orgId: 1, status: 1, createdAt: -1 }`

ID prefix: `appr_` + ulid.

---

### Task 1: `packages/policy` types and rules

**Files:**
- Create: `packages/policy/package.json`, `tsconfig.json`, `src/types.ts`, `src/rules.ts`, `src/actions.ts`, `src/index.ts`

**Interfaces:**

```ts
// actions.ts
export const POLICY_ACTIONS = [
  "pay.vendor",
  "collect.invoice",
  "discount",
  "listing.publish",
  "browser.write",
] as const;

export type PolicyAction = (typeof POLICY_ACTIONS)[number];

// rules.ts
import { z } from "zod";

export const policyRuleSchema = z.object({
  field: z.string(),
  op: z.enum(["eq", "neq", "lte", "gte", "in", "truthy"]),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
  ]).optional(),
});

export const compiledPolicySchema = z.object({
  action: z.string(),
  effect: z.enum(["allow", "deny", "require_approval"]),
  description: z.string(),
  rules: z.array(policyRuleSchema),
});

export function parseCompiledPolicy(raw: string): CompiledPolicy {
  return compiledPolicySchema.parse(JSON.parse(raw));
}
```

---

### Task 2: Evaluation engine

**Files:**
- Create: `packages/policy/src/evaluate.ts`
- Test: `packages/policy/src/evaluate.test.ts`

**Interfaces:**

```ts
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
  return null;
}

function ruleMatches(ctx: EvaluationContext, rule: PolicyRule): boolean {
  const actual = resolveField(ctx, rule.field);
  switch (rule.op) {
    case "eq": return actual === rule.value;
    case "neq": return actual !== rule.value;
    case "lte": return typeof actual === "number" && typeof rule.value === "number" && actual <= rule.value;
    case "gte": return typeof actual === "number" && typeof rule.value === "number" && actual >= rule.value;
    case "in": return Array.isArray(rule.value) && rule.value.includes(String(actual));
    case "truthy": return Boolean(actual);
    default: return false;
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
    return null; // policy does not apply
  }
  return {
    decision: compiled.effect,
    policyKey,
    policyLabel,
    reasons: [compiled.description],
    matchedRules: compiled.rules,
  };
}

export function aggregateDecision(results: PolicyEvaluationResult[]): PolicyDecision {
  if (results.some((r) => r.decision === "deny")) return "deny";
  if (results.some((r) => r.decision === "require_approval")) return "require_approval";
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
    results.length === 0
      ? "require_approval"
      : aggregateDecision(results);
  const outcome: EvaluateOutcome = {
    finalDecision,
    results:
      results.length === 0
        ? [{
            decision: "require_approval",
            policyKey: null,
            policyLabel: null,
            reasons: ["No policy matched"],
            matchedRules: [],
          }]
        : results,
  };
  return outcome;
}
```

**Tests (must implement):**

1. `pay.vendor` ₹20,000 to verified vendor → `require_approval` (policy matches with effect require_approval).
2. `pay.vendor` ₹30,000 → no policy match on amount → default `require_approval`.
3. `pay.vendor` to unverified vendor → no match (verified_bank rule fails) → default require_approval.
4. `collect.invoice` on overdue invoice → `allow`.
5. Multiple policies: one allow + one deny → `deny`.

---

### Task 3: Seed policy enrichment

**Files:**
- Modify: `packages/seed/src/arka.ts`
- Modify: `packages/seed/src/arka.test.ts`

Update Policy upserts:

```ts
await store.upsertNode(
  node("Policy:pay.vendor", "Policy", "Pay vendor policy", {
    enabled: true,
    action: "pay.vendor",
    maxInPaise: 2500000,
    rules_json: JSON.stringify({ /* CompiledPolicy above */ }),
  }),
);
```

Add test:

```ts
it("Policy nodes have parseable rules_json", async () => {
  await seedArkaAtelier(store);
  const p = await store.getNodeByKey("org_arka", "Policy:pay.vendor");
  expect(() => parseCompiledPolicy(String(p!.props.rules_json))).not.toThrow();
});
```

---

### Task 4: API policy service + routes

**Files:**
- Create: `apps/api/src/services/policy.ts`
- Create: `apps/api/src/routes/policies.ts`
- Test: `apps/api/src/test/policies.test.ts`

**Interfaces:**

```ts
// services/policy.ts
export async function loadPolicies(
  store: GraphStore,
  orgId: string,
): Promise<Array<{ key: string; label: string; compiled: CompiledPolicy; node: NodeRecord }>> {
  const nodes = await store.listNodes(orgId, "Policy");
  return nodes
    .filter((n) => n.props.enabled !== false)
    .map((n) => ({
      key: n.key,
      label: n.label,
      node: n,
      compiled: parseCompiledPolicy(String(n.props.rules_json)),
    }));
}

export async function evaluateAction(
  store: GraphStore,
  orgId: string,
  proposed: ProposedAction,
): Promise<EvaluateOutcome> {
  let targetProps = null;
  if (proposed.targetNodeKey) {
    const target = await store.getNodeByKey(orgId, proposed.targetNodeKey);
    targetProps = target?.props ?? null;
  }
  const policies = await loadPolicies(store, orgId);
  return evaluateProposedAction(policies, { proposed, targetProps });
}
```

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/policies` | | `{ policies: Array<{ node, compiled }> }` |
| POST | `/v1/policies/evaluate` | `{ proposedAction: ProposedAction }` | `{ evaluation: EvaluateOutcome }` |
| POST | `/v1/policies/:key/toggle` | `{ enabled: boolean }` | `{ node }` |

`POST toggle` upserts node props `enabled`.

Register in `app.ts` under org-id scoped routes.

---

### Task 5: Approvals service + routes

**Files:**
- Modify: `apps/api/src/mongo.ts` — expose `approvals` collection
- Create: `apps/api/src/services/approvals.ts`
- Create: `apps/api/src/routes/approvals.ts`
- Test: `apps/api/src/test/approvals.test.ts`

**Interfaces:**

```ts
export async function createApproval(
  db: Db,
  store: GraphStore,
  orgId: string,
  proposed: ProposedAction,
): Promise<ApprovalRecord> {
  const evaluation = await evaluateAction(store, orgId, proposed);
  if (evaluation.finalDecision === "allow") {
    // still create record with status approved auto? Locked: NO — return 200 { autoAllowed: true, evaluation } without approval row
  }
  if (evaluation.finalDecision === "deny") {
    // return 403 { denied: true, evaluation }
  }
  // require_approval → insert pending ApprovalRecord
}

export async function resolveApproval(
  db: Db,
  store: GraphStore,
  orgId: string,
  approvalId: string,
  resolution: { status: "approved" | "rejected" | "edited"; resolvedBy: string; note?: string },
): Promise<ApprovalRecord> {
  // update record; writeAuditEvent approval.resolved; on approved + action collect.invoice → optional hook placeholder
}
```

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/v1/approvals` | `{ proposedAction }` | `{ approval }` or `{ autoAllowed, evaluation }` or 403 `{ denied, evaluation }` |
| GET | `/v1/approvals/:id` | | `{ approval }` |
| GET | `/v1/approvals` | `?status=pending` | `{ approvals: ApprovalRecord[] }` |
| POST | `/v1/approvals/:id/resolve` | `{ status, resolvedBy, note? }` | `{ approval }` |

Use `writeAuditEvent` from Step 3 for `approval.created`, `approval.resolved`.

---

### Task 6: Wire payment-links to policy (audit-only for humans)

**Files:**
- Modify: `apps/api/src/routes/payment-links.ts`

Before Razorpay call, build:

```ts
const proposed: ProposedAction = {
  action: "collect.invoice",
  orgId: request.orgId,
  amountInPaise: invoice.props.amountInPaise as number,
  targetNodeKey: invoice.key,
  explanation: `Payment Link for ${invoice.label}`,
  proposedBy: request.headers["x-actor"] ?? "human:anika@arka.atelier",
};
const evaluation = await evaluateAction(store, orgId, proposed);
await writeAuditEvent(store, {
  eventType: "policy.evaluated",
  actor: proposed.proposedBy,
  sideEffectClass: "read",
  payload: { proposed, evaluation },
  aboutNodeIds: [invoice._id],
});
// Human-initiated: proceed regardless of decision (except deny → 403)
if (evaluation.finalDecision === "deny") {
  return reply.code(403).send({ error: "policy_denied", evaluation });
}
```

Agent path in Step 7 will use `/v1/approvals` first.

---

### Task 7: ApprovalCard UI

**Files:**
- Create: `apps/web/src/components/agent/ApprovalCard.tsx`
- Create: `apps/web/src/components/agent/ApprovalCardList.tsx`
- Create: `apps/web/src/components/agent/MandateChip.tsx`
- Test: `apps/web/src/components/agent/ApprovalCard.test.tsx`
- Modify: `apps/web/src/components/shell/AgentRail.tsx`

**ApprovalCard props (locked):**

```tsx
export type ApprovalCardProps = {
  id: string;
  title: string;
  amountInPaise: number | null;
  why: string;
  policyLabel: string | null;
  policyDecision: PolicyDecision;
  onApprove: () => void;
  onEdit: () => void;
  onReject: () => void;
  loading?: boolean;
};
```

Layout (spec §5.5):

- Container: `border-l-[3px] border-l-copper bg-surface p-4`, no bounce animation
- Title: 15px medium Plex Sans — e.g. `Send Payment Link for INV-90`
- Amount: `font-mono tabular-nums text-teal` — `formatInr(amountInPaise)` or omit if null
- Why: one paragraph, 13px muted
- Policy line: `Policy: collect.invoice · require approval` in 12px mono
- Buttons row: `Approve` (teal outline), `Edit` (muted), `Reject` (risk text). Verbs only.

**ApprovalCardList:**

- Poll `GET /v1/approvals?status=pending` every 10s and on mount
- Map to ApprovalCard
- `onApprove` → `POST /v1/approvals/:id/resolve { status: "approved", resolvedBy: "human:anika@arka.atelier" }`
- `onReject` → status rejected
- `onEdit` → opens inspector on target node in canvas (call `focusNode` from console context) — no modal

**AgentRail:**

```tsx
<header>Governor · copper border</header>
<ApprovalCardList />
{pending.length === 0 ? <IdleCopy exceptionCount={...} /> : null}
<footer>Approval cards appear here when money moves.</footer>
```

**MandateChip:**

```tsx
type MandateChipProps = { policyKey: string; detail: string };
// pill: text-[11px] font-mono px-2 py-0.5 border border-teal text-teal
// content: `policy:pay.vendor ≤ ₹25,000 · approved by Anika · 12 Aug`
```

Used in PolicyStudio history rows for `allow` decisions.

Extend `apps/web/src/lib/api.ts`:

```ts
export type ApprovalDto = { /* mirror ApprovalRecord */ };
export async function fetchPendingApprovals(): Promise<ApprovalDto[]> { ... }
export async function resolveApproval(id: string, status: "approved" | "rejected"): Promise<void> { ... }
```

---

### Task 8: Policy Studio canvas view

**Files:**
- Create: `apps/web/src/components/policy/PolicyStudio.tsx`
- Modify: `apps/web/src/components/shell/icons.tsx` — add `IconPolicy`
- Modify: `apps/web/src/components/shell/NavRail.tsx` — Money icon → Policy, `id: "policy"`, enabled
- Modify: `apps/web/src/lib/console-context.tsx` — add `ConsoleView = ... | "policy"`
- Modify: `apps/web/src/components/Console.tsx`

**PolicyStudio layout:**

```
┌─────────────────────────────────────────────┐
│ Policy Studio                               │
├─────────────────────────────────────────────┤
│ [Policy row] Pay vendor · ON/OFF toggle     │
│   plain description                         │
│   compiled rules mono block (collapsed)     │
├─────────────────────────────────────────────┤
│ Recent decisions (from GET /v1/audit)       │
│ policy.evaluated events + mandate chips     │
└─────────────────────────────────────────────┘
```

- Fetch `GET /v1/policies` on mount
- Toggle → `POST /v1/policies/:key/toggle`
- History: `GET /v1/audit?limit=20` filter client-side for `event_type === "policy.evaluated"`
- Show `MandateChip` when evaluation.finalDecision === `allow`

---

### Task 9: Integration tests + manual demo script

**Files:**
- Complete API tests for full flow

**Manual script (document for engineer):**

```bash
# 1. Evaluate vendor payout within limit
curl -X POST http://localhost:4000/v1/policies/evaluate \
  -H "x-org-id: org_arka" -H "Content-Type: application/json" \
  -d '{
    "proposedAction": {
      "action": "pay.vendor",
      "orgId": "org_arka",
      "amountInPaise": 2000000,
      "targetNodeKey": "Org:Meenakshi-Brass",
      "explanation": "Pay PO-104 partial",
      "proposedBy": "agent:money"
    }
  }'
# expect require_approval

# 2. Create approval
curl -X POST http://localhost:4000/v1/approvals \
  -H "x-org-id: org_arka" -H "Content-Type: application/json" \
  -d '{ "proposedAction": { ... same ... } }'

# 3. Open web UI — card appears in agent rail
# 4. Approve via UI
# 5. Policy Studio shows toggle + history
```

Run: `pnpm --filter @karya/policy test && pnpm --filter @karya/api test && pnpm --filter @karya/web test`

---

## Done when

- `packages/policy` evaluates seeded policies with correct allow/deny/require_approval outcomes.
- `GET/POST /v1/policies/*` and `POST/GET /v1/approvals/*` work with tests.
- Pending approvals render as Approval cards in the agent rail; Approve/Reject resolves via API.
- Policy Studio view lists policies, toggles enabled, shows evaluation history.
- `POST /v1/payment-links` logs `policy.evaluated` and blocks on `deny`.
- Seed policies include valid `rules_json`.
- No Governor agent or autonomous money execution yet.

## Out of scope (step 5+)

Governor agent, specialist tools, Money agent auto-collect loop, `/a2a`, Buyer Agent, forced payment failure demo, audit explorer full UI, browser sandbox, AWS deploy.

---

## Self-review

- Spec §7.3 mandates — compiled Policy nodes + evaluation.
- Spec §5.5 Approval card + mandate chip — Task 7.
- Spec §8.12 Policy studio — Task 8.
- Spec §9.2 bounded/gated — evaluation before payment-link deny path.
- Spec §14 item 4 — governance before agents.
- Policy actions, rule ops, API shapes, and ApprovalRecord schema locked.
- No TBD on default decision when no policy matches (require_approval).
