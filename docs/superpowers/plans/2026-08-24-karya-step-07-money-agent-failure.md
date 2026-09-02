# Karya Step 7 — Money Agent, Collections Loop & Forced Failure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Track 01 demo’s money moment — the Money agent detects overdue INV-90, proposes a gated Payment Link, handles `payment_link.expired` / `payment.failed` with graph-backed impact explanation, surfaces recovery options in the agent rail as Approval cards, and leaves a complete audit trail visible in a Money ledger + Audit explorer. Every rupee movement is explainable, bounded, gated, and auditable.

**Architecture:** `packages/agents` gains a **Money specialist** tool namespace invoked by the Governor (Step 5). Collections run as a deterministic loop over graph exceptions — not LLM improvisation. Webhook side effects stay in Step 3 handlers; Step 7 adds **post-webhook orchestration** (`handlePaymentFailure`) that classifies failure, runs `GraphStore.impact`, and creates recovery proposals. `POST /v1/admin/simulate-webhook` signs mock Razorpay payloads for the demo fail button. Approvals from Step 4 gain **execution hooks** on resolve so Approve actually creates the retry link or adjusts stock. UI: Money nav → ledger; agent rail shows tool trace + impact-rich approval cards; Inbox highlights payment failures in `risk`.

**Tech Stack:** TypeScript 5.8 strict, Fastify 5, existing `@karya/graph`, `@karya/policy`, `@karya/razorpay`, Vercel AI SDK tool schemas (from Step 5 Governor), Vitest + mongodb-memory-server, Next.js 15 (Money view, AuditExplorer, AgentRail extensions).

## Global Constraints

From spec §7.6, §8.5–§8.6, §9.2, §11 step 5 and Steps 1–6.

- **Prerequisite:** Steps 3–4 done (Razorpay adapter, policy, approvals). Step 5 done (`packages/agents` Governor shell + tool loop). Step 6 optional for this step — Buyer Agent checkout is independent.
- **Test mode only.** `POST /v1/admin/simulate-webhook` is dev-only (`NODE_ENV=development`). Never fake inbound money — retry links call real Razorpay test API when keys configured.
- **Money agent never bypasses policy.** `collect.invoice` with `proposedBy: "agent:money"` follows `/v1/approvals` when policy says `require_approval`; auto-executes only on `allow`.
- **Graph is system of record.** Nudge counts, hold-until timestamps, failure classification live on node `props`. Audit = `Event` nodes (Step 3 pattern).
- **Stopping rule locked:** max **3** collection nudges per invoice (`Invoice.props.nudge_count`). At 3 → escalate to Inbox (`collections.escalated`), stop auto-proposing links.
- **Failure path locked:** classify → impact query → propose options → approval card with graph “why” → execute on approve → audit explorer shows full trace. No silent state changes. No double-charge (new link = new idempotency key suffix).
- **Demo subgraph locked:** failure demo targets seeded `Payment:plink_7` → `Invoice:INV-90` → `SalesOrder:SO-218` → `Stock:Diya-Large@Workshop` (9 reserved) → `Lead:IG-Ananya` waiting on same SKU.
- UI tokens unchanged. Approval card spec §5.5 is law — copper left edge, mono amount, one-paragraph why, policy line, Approve / Edit / Reject.
- `orgId`: `org_arka`. API port `4000`, web `3000`.
- Do not add Redis, Neo4j, or a parallel payments table.

---

## File structure (this step creates / modifies)

```
.env.example                                         SIMULATE_WEBHOOK note (modify)
packages/policy/src/actions.ts                       add money.* actions (modify)
packages/graph/src/exceptions.ts                     payment.failure + collections.escalated (modify)
packages/graph/src/exceptions.test.ts                new tests (create)
packages/seed/src/arka.ts                            plink_7 razorpay id, nudge_count=1 (modify)
packages/agents/package.json                         if missing from Step 5 — workspace dep (modify)
packages/agents/src/index.ts
packages/agents/src/types.ts                         ToolDefinition, ToolTrace (modify/create)
packages/agents/src/money/classify-failure.ts
packages/agents/src/money/impact-copy.ts            graph → human "why" paragraph
packages/agents/src/money/collections-loop.ts
packages/agents/src/money/recovery-options.ts
packages/agents/src/money/tools.ts                  Governor tool schemas
packages/agents/src/money/handle-failure.ts
packages/agents/src/money/payout-propose.ts
packages/agents/src/money/classify-failure.test.ts
packages/agents/src/money/collections-loop.test.ts
packages/agents/src/money/impact-copy.test.ts
packages/razorpay/src/webhooks.ts                    buildSimulatedPayload helper (modify)
apps/api/package.json                                @karya/agents (modify)
apps/api/src/env.ts                                  unchanged unless needed
apps/api/src/app.ts                                  register new routes (modify)
apps/api/src/routes/ledger.ts
apps/api/src/routes/admin.ts                         simulate-webhook + run-collections (create)
apps/api/src/routes/agents.ts                        POST /v1/agents/money/tick (create)
apps/api/src/services/ledger.ts
apps/api/src/services/simulate-webhook.ts
apps/api/src/services/collections.ts                 nudge + stopping rules
apps/api/src/services/payment-failure.ts             post-webhook orchestration
apps/api/src/services/approvals.ts                   execution hooks on resolve (modify)
apps/api/src/services/payment-links.ts               releaseReservation helper (modify)
apps/api/src/routes/webhooks.ts                      call payment-failure after expired/failed (modify)
apps/api/src/test/ledger.test.ts
apps/api/src/test/simulate-webhook.test.ts
apps/api/src/test/collections.test.ts
apps/api/src/test/payment-failure.test.ts
apps/api/src/test/approval-execution.test.ts
apps/web/src/lib/api.ts                              ledger, audit filters, simulate (modify)
apps/web/src/lib/console-context.tsx                 money view (modify)
apps/web/src/components/shell/NavRail.tsx            Money → ledger; Policy via palette (modify)
apps/web/src/components/shell/icons.tsx                NAV: money enabled as Money (modify)
apps/web/src/components/shell/AgentRail.tsx            tool trace + failure impact block (modify)
apps/web/src/components/agent/ApprovalCard.tsx         optional impact bullets (modify)
apps/web/src/components/agent/ApprovalCardList.tsx     money.recovery titles (modify)
apps/web/src/components/agent/ToolTrace.tsx            stacked tool rows (create)
apps/web/src/components/agent/FailureImpactBlock.tsx   risk-tinted impact summary (create)
apps/web/src/components/money/LedgerView.tsx
apps/web/src/components/money/AuditExplorer.tsx
apps/web/src/components/money/DemoControls.tsx         simulate failure button (dev)
apps/web/src/components/money/LedgerView.test.tsx
apps/web/src/components/command/commands.ts            Policy Studio + Simulate failure (modify)
apps/web/src/components/Console.tsx                  money view route (modify)
apps/web/src/components/inbox/ExceptionList.tsx        highlight payment.failure (modify)
```

**Nav decision (locked):** Step 4 mapped the Money icon to Policy Studio. Step 7 **restores Money → ledger** (`ConsoleView = "money"`). Policy Studio remains at view `"policy"`, reachable via **Command palette** (`Open Policy Studio`) and a text link in the Money ledger header. Eight nav icons unchanged per spec §5.4.

---

## Demo narrative mapping (spec §11 step 5)

Every beat must have code + a test or manual script line.

| Demo beat | Code surface | Verification |
|---|---|---|
| Boutique link already sent, overdue | Seed `Payment:plink_7` + `invoice.overdue` exception | `GET /v1/exceptions` |
| Money agent proposes collect | `runCollectionsLoop` or Governor tick | Tool trace row + optional auto link |
| Policy allows autonomous collect | `Policy:collect.invoice` → `allow` | Mandate chip on executed action |
| Operator forces expire | `POST /v1/admin/simulate-webhook` | Payment → `expired`, Event node |
| Inbox goes red | `payment.failure` exception severity `risk` | Web Inbox badge increases |
| Impact: SO-218, stock, ship date | `buildFailureImpactCopy` | Approval card why paragraph |
| Options: retry / hold 48h / release to lead | `money.recovery` proposedAction options | Three separate cards OR one card with numbered choices — **locked: one card, metadata.option** |
| Approve retry | `resolveApproval` → new Payment Link | New `Payment:plink_*`, audit chain |
| Audit explorer full trace | `GET /v1/audit?actor=agent:money` | UI filter chips |

---

## Locked data shapes

### Invoice collection props (add to seed + runtime)

```ts
// Invoice.props — additive, idempotent upsert
{
  nudge_count: number;        // default 0; seed INV-90 = 1 (one prior nudge)
  last_nudge_at: string;      // ISO
  collections_state: "idle" | "link_sent" | "escalated";
}
```

### Payment failure props

```ts
// Payment.props — set by webhook + classify step
{
  failure_class: "expired" | "failed" | "cancelled" | null;
  failure_at: string;         // ISO
}
```

### Stock hold props

```ts
// Stock.props — for 48h hold option
{
  hold_until: string | null;  // ISO; while set and > now, reserved qty locked to SO-218
}
```

### New policy actions (add to `POLICY_ACTIONS`)

```ts
"money.recovery"   // retry link, hold stock, release to lead — all require approval
"collect.invoice"  // existing
"pay.vendor"       // existing
```

**Policy:collect.invoice** stays `allow` for overdue — demo auto-collect works.

**Policy:money.recovery** (new seed node `Policy:money.recovery`):

```json
{
  "action": "money.recovery",
  "effect": "require_approval",
  "description": "Payment recovery actions (retry, hold stock, release to lead) require operator approval.",
  "rules": [{ "field": "amountInPaise", "op": "gte", "value": 0 }]
}
```

Always matches when `amountInPaise` present — effect is always `require_approval`.

### Recovery option enum (locked)

```ts
export type RecoveryOption =
  | "retry_link"
  | "hold_stock_48h"
  | "release_to_lead";

export type RecoveryProposal = {
  option: RecoveryOption;
  paymentKey: string;
  invoiceKey: string;
  salesOrderKey: string;
  stockKey: string;
  leadKey: string;
  amountInPaise: number;
  impactSummary: string;   // one paragraph for Approval card why
  impactNodeKeys: string[]; // for graph focus on Edit
};
```

### Ledger API response (locked)

```ts
export type LedgerEntry = {
  node: NodeRecord;
  direction: "in" | "out";
  amountInPaise: number;
  status: string;
  counterparty: string | null;
  at: string;
};

export type LedgerSummary = {
  cashInPaise: number;           // sum captured inbound
  receivablesInPaise: number;    // overdue + sent invoices
  payablesInPaise: number;       // open PO approx — optional 0 in MVP
  payoutsOutInPaise: number;     // sum payout channel
  entries: LedgerEntry[];
};
```

### Simulate webhook request (locked)

```ts
// POST /v1/admin/simulate-webhook — development only
{
  event: "payment_link.expired" | "payment.failed";
  paymentLinkId?: string;  // default "plink_7" from seed props if linked to real id
  paymentKey?: string;     // default "Payment:plink_7"
}
// Response: { received: true, signature: string, eventNodeId: string }
```

Implementation signs body with `RAZORPAY_WEBHOOK_SECRET` and invokes the **same** handler functions as `routes/webhooks.ts` (extract shared dispatch to `services/webhook-dispatch.ts` if needed — do not duplicate graph writes).

---

## Design bar (Money view + failure surfaces)

Read before touching UI.

- **Money ledger:** dense table, not cards. Columns: When (mono 12px), Direction (in=teal / out=copper), ID (mono), Counterparty, Amount (mono tabular-nums), Status (dot: teal captured, warn sent, risk expired/failed). Header row: `Payments in` / `Payouts out` summary chips in mono.
- **Audit explorer:** below ledger, filter chips: Actor (`human:*`, `agent:money`, `webhook:razorpay`), Side-effect (`money`, `write`, `read`), Min amount (₹). Rows expand to show `payload_json` in mono block — not raw JSON dump; format keys readable.
- **Demo controls:** bottom of Money view, dev only (`process.env.NODE_ENV === "development"` gate on API; web shows if simulate endpoint returns 200 on OPTIONS or a `GET /v1/bootstrap` flag `demoMode: true`). Single button: `Simulate payment link expired (INV-90)` — risk outline, no icon pack.
- **Failure impact block** (agent rail): when pending approval action is `money.recovery`, show 3px `risk` left border block above the card listing: `SO-218 promised Friday · 9× Diya-Large reserved · IG-Ananya waiting` — pulled from API field `impactSummary`, not client guess.
- **Tool trace:** stacked rows, 12px mono tool name + 13px outcome. Example: `money.classifyFailure → expired · INV-90` then `graph.impact → 6 nodes` then `money.proposeRecovery → 3 options`. Copper dot while running, teal check when done. No typewriter animation (spec §5.6).
- **Inbox:** exceptions with code `payment.failure` or `payment.uncollected` where `severity === "risk"` get full row background `risk/10` — “goes red” for demo.

---

### Task 1: Graph exceptions + seed enrichment

**Files:**
- Modify: `packages/graph/src/exceptions.ts`
- Create: `packages/graph/src/exceptions.test.ts`
- Modify: `packages/seed/src/arka.ts`, `packages/seed/src/arka.test.ts`

**Interfaces:**
- Consumes: existing exception evaluators
- Produces: new codes `payment.failure`, `collections.escalated`

- [ ] **Step 1: `payment.failure` exception**

After `paymentUncollected`, add evaluator for Payment where `status === "expired" || status === "failed"`:

```ts
function paymentFailure(node: NodeRecord, nodes, edges): Exception | null {
  if (node.type !== "Payment") return null;
  const status = propString(node.props, "status");
  if (status !== "expired" && status !== "failed") return null;

  // Walk PAYS → Invoice → INVOICES ← SO → ORDER_CONTAINS → SKU → STOCK
  const impact = /* reuse inline walk or import helper */;
  const detail = buildShortFailureDetail(impact); // e.g. "Lotus Boutique's ₹14,800 link expired — 8× Diya-Large still reserved for Friday; IG-Ananya is next in line."

  return {
    id: newExceptionId("payment.failure", node._id),
    severity: "risk",
    code: "payment.failure",
    nodeId: node._id,
    title: `${node.label} ${status}`,
    detail,
  };
}
```

Detail **must** name SO-218, INV-90, and lead when present in subgraph — test asserts substring.

- [ ] **Step 2: `collections.escalated` exception**

For Invoice where `nudge_count >= 3` and `status !== "paid"`:

```ts
{
  code: "collections.escalated",
  severity: "risk",
  title: `${node.label} — collections escalated`,
  detail: `Three payment nudges sent; manual follow-up required before another link.`,
}
```

- [ ] **Step 3: Seed updates**

```ts
// Invoice:INV-90
{ status: "overdue", amountInPaise: 1480000, dueAt: daysAgo(11), nudge_count: 1, last_nudge_at: daysAgo(3), collections_state: "link_sent" }

// Payment:plink_7 — add if real link created in dev, else placeholder id matching simulate payload
{ status: "sent", channel: "payment_link", amountInPaise: 1480000, razorpay_payment_link_id: "plink_7" }

// Stock:Diya-Large@Workshop
{ on_hand: 12, reserved: 9, incoming: 0, hold_until: null }
```

- [ ] **Step 4: Tests**

Run: `pnpm --filter @karya/graph test && pnpm --filter @karya/seed test`

Expected: exceptions include `payment.failure` when payment status flipped to expired in test fixture.

---

### Task 2: Impact copy builder (`packages/agents/src/money/impact-copy.ts`)

**Files:**
- Create: `packages/agents/src/money/impact-copy.ts`
- Test: `packages/agents/src/money/impact-copy.test.ts`

**Interfaces:**

```ts
export type FailureImpact = {
  payment: NodeRecord;
  invoice: NodeRecord | null;
  salesOrder: NodeRecord | null;
  buyerOrg: NodeRecord | null;
  stock: NodeRecord | null;
  sku: NodeRecord | null;
  lead: NodeRecord | null;
  promiseDate: string | null;
  reservedQty: number;
  amountInPaise: number;
};

export async function loadFailureImpact(
  store: GraphStore,
  orgId: string,
  paymentId: string,
): Promise<FailureImpact>;

export function buildFailureImpactCopy(impact: FailureImpact): string;
// Locked demo copy shape:
// "Lotus Boutique's Payment Link for INV-90 (₹14,800) expired. SO-218's 8× Diya-Large promised Friday remain reserved (9 units held at Workshop). Lead IG-Ananya is waiting on the same SKU."
```

- [ ] **Step 1: Tests first** with manually inserted beating-heart subgraph (same as Step 1 graph tests).

- [ ] **Step 2: Implement** using `store.neighborhood(paymentId, 2)` + typed edge walks (`PAYS`, `INVOICES`, `BUYS`, `ORDER_CONTAINS`, `STOCK_OF`, `SOURCED_FROM`).

Run: `pnpm --filter @karya/agents test`

---

### Task 3: Failure classification + recovery proposals

**Files:**
- Create: `packages/agents/src/money/classify-failure.ts`
- Create: `packages/agents/src/money/recovery-options.ts`
- Create: `packages/agents/src/money/handle-failure.ts`
- Test: `packages/agents/src/money/classify-failure.test.ts`

**Interfaces:**

```ts
export type FailureClass = "expired" | "failed" | "cancelled";

export function classifyPaymentFailure(
  payment: NodeRecord,
  webhookEvent: string,
): FailureClass;

// payment_link.expired → expired; payment.failed → failed; cancelled status → cancelled

export function buildRecoveryProposals(
  impact: FailureImpact,
): RecoveryProposal[]; // always 3 options, fixed order

// retry_link explanation:
// "Issue a new Payment Link for INV-90 (₹14,800) to Lotus Boutique. Same amount; new link idempotency key."

// hold_stock_48h:
// "Extend stock reservation on Diya-Large for SO-218 by 48 hours while collections retries."

// release_to_lead:
// "Release 1× Diya-Large reservation to fulfill Lead IG-Ananya if Lotus does not pay by hold expiry."
```

```ts
export async function handlePaymentFailure(
  store: GraphStore,
  db: Db,
  orgId: string,
  paymentKey: string,
  webhookEvent: string,
): Promise<{ impact: FailureImpact; proposals: RecoveryProposal[]; approvalIds: string[] }> {
  // 1. Load payment; classify; upsert failure_class + failure_at props
  // 2. loadFailureImpact
  // 3. buildRecoveryProposals
  // 4. For each proposal → createApproval with action "money.recovery", metadata.option, explanation = impactSummary + option-specific sentence
  // 5. writeAuditEvent money.failure_detected, sideEffectClass write
  // 6. Return approval IDs (pending cards in UI)
}
```

**Locked behavior:** create **three** pending approvals (one per option). Operator approves **one**; rejecting others is OK — demo script approves `retry_link` only.

- [ ] Wire `handlePaymentFailure` from `apps/api/src/routes/webhooks.ts` at end of `handlePaymentLinkExpired` and `handlePaymentFailed`.

---

### Task 4: Collections loop + stopping rules

**Files:**
- Create: `packages/agents/src/money/collections-loop.ts`
- Create: `apps/api/src/services/collections.ts`
- Test: `packages/agents/src/money/collections-loop.test.ts`, `apps/api/src/test/collections.test.ts`

**Interfaces:**

```ts
export async function runCollectionsLoop(
  store: GraphStore,
  db: Db,
  orgId: string,
  deps: {
    createLink: typeof createPaymentLinkForInvoice;
    evaluate: typeof evaluateAction;
    createApproval: typeof createApproval;
    audit: typeof writeAuditEvent;
  },
): Promise<{
  processed: Array<{ invoiceKey: string; outcome: "auto_sent" | "approval_created" | "skipped" | "escalated" }>;
}>;
```

Algorithm (locked):

1. `exceptions()` → filter `code === "invoice.overdue"`.
2. For each invoice node:
   - If `nudge_count >= 3` → set `collections_state: "escalated"`, outcome `escalated`, **continue**.
   - If active Payment with `PAYS` edge and status `sent` → outcome `skipped` (link already out).
   - Build `ProposedAction` `{ action: "collect.invoice", targetNodeKey, amountInPaise, proposedBy: "agent:money", explanation: "Send Payment Link for {label} ({amount}) to {buyer}." }`.
   - `evaluateAction` → `deny` → audit + skip.
   - `allow` → call `createPaymentLinkForInvoice` with actor `agent:money`; increment `nudge_count`; set `collections_state: "link_sent"`; outcome `auto_sent`.
   - `require_approval` → `createApproval`; outcome `approval_created`.
3. Audit: `collections.tick` Event with processed list.

- [ ] **API:** `POST /v1/agents/money/tick` runs loop (org-scoped). Governor cron calls this; demo can curl it.

---

### Task 5: Approval execution hooks

**Files:**
- Modify: `apps/api/src/services/approvals.ts`
- Modify: `apps/api/src/services/payment-links.ts`
- Create: `apps/api/src/test/approval-execution.test.ts`

**Interfaces:**

Extend `resolveApproval` — on `status === "approved"`:

| `proposedAction.action` | Execute |
|---|---|
| `collect.invoice` | `createPaymentLinkForInvoice`; increment invoice `nudge_count` |
| `pay.vendor` | `buildPayoutAdapter().proposePayout(...)` + Payment node `channel: payout` |
| `money.recovery` + `metadata.option === "retry_link"` | New link: idempotency key `karya_{orgId}_payment_link_{invoiceKey}_retry_{timestamp}`; increment nudge_count |
| `money.recovery` + `hold_stock_48h` | Upsert stock `hold_until = now + 48h` |
| `money.recovery` + `release_to_lead` | Decrement stock `reserved` by 1 (min 0); create `Task:Release-to-IG-Ananya` node; audit |

All executions → `writeAuditEvent` with `sideEffectClass: "money"`.

- [ ] **Double-charge guard:** retry idempotency key **must differ** from original. Test: two retries → two Payment nodes, one Invoice.

- [ ] **Payment link paid path:** existing webhook marks invoice paid — add `releaseReservationOnPaid(store, invoiceId)`:

```ts
// Walk invoice → SO → ORDER_CONTAINS → SKU → Stock; if invoice paid, keep reserved until shipped (MVP: no-op on paid — spec "release reservation" means failure path can release; paid = invoice settled, stock stays promised)
```

**Locked MVP interpretation:** “release reservation” applies to **failure recovery release_to_lead**, not paid webhook. Paid webhook only updates invoice status (Step 3 already does).

---

### Task 6: Simulate webhook + admin routes

**Files:**
- Create: `packages/razorpay/src/simulate.ts` (or extend `webhooks.ts`)
- Create: `apps/api/src/services/simulate-webhook.ts`
- Create: `apps/api/src/routes/admin.ts`
- Test: `apps/api/src/test/simulate-webhook.test.ts`

**Interfaces:**

```ts
export function buildSimulatedWebhookPayload(input: {
  event: "payment_link.expired" | "payment.failed";
  paymentLinkId: string;
  amountInPaise: number;
  orgId: string;
  invoiceKey: string;
}): { body: string; payload: RazorpayWebhookPayload };

export function signWebhookBody(body: string, secret: string): string;
```

```ts
// apps/api/src/routes/admin.ts
app.post("/v1/admin/simulate-webhook", async (req, reply) => {
  if (env.NODE_ENV !== "development") return reply.code(403).send({ error: "forbidden" });
  // resolve paymentKey default Payment:plink_7
  // build payload, sign, dispatch to shared webhook handler
  // return { received: true, eventType, paymentNodeId }
});

app.post("/v1/admin/run-collections", async (req) => {
  if (env.NODE_ENV !== "development") ...
  return runCollectionsLoop(...);
});
```

- [ ] Test: simulate expired → payment status `expired` → `payment.failure` exception exists → three pending approvals.

---

### Task 7: Ledger service + route

**Files:**
- Create: `apps/api/src/services/ledger.ts`
- Create: `apps/api/src/routes/ledger.ts`
- Test: `apps/api/src/test/ledger.test.ts`

**Interfaces:**

```ts
export async function getLedger(
  store: GraphStore,
  orgId: string,
): Promise<LedgerSummary>;
```

- Inbound: `Payment` nodes where `channel === "payment_link"` OR props indicate capture.
- Outbound: `Payment` nodes where `channel === "payout"`.
- Counterparty: graph walk (same as payment-links customer resolution).
- Register `GET /v1/ledger` in `app.ts`.

- [ ] Extend `GET /v1/audit` query params: `?minAmountPaise=100000` (optional filter in `listAuditEvents` — parse payload_json amounts for money events).

---

### Task 8: Money agent tools (Governor namespace)

**Files:**
- Create: `packages/agents/src/money/tools.ts`
- Modify: `packages/agents/src/index.ts` (export money tools — assumes Step 5 Governor registry)

**Tool schemas (locked):**

| Tool name | sideEffectClass | Description |
|---|---|---|
| `money_list_overdue_invoices` | read | List overdue invoices from exceptions |
| `money_propose_collection` | draft | Propose Payment Link for one invoice |
| `money_run_collections_loop` | write | Run full collections tick |
| `money_classify_failure` | read | Classify payment failure_class |
| `money_impact_query` | read | Return FailureImpact + copy for a payment key |
| `money_propose_recovery` | draft | Create recovery approvals for failed payment |
| `money_propose_payout` | draft | Propose vendor payout (pay.vendor path) |
| `money_get_ledger` | read | Return ledger summary |

Each tool schema includes required `explanation: string` field (spec §7.2).

- [ ] Register tools in Governor with namespace prefix `money_` exposed in API as `POST /v1/agents/governor/message` (Step 5 route) — Step 7 only adds Money tools to registry; if Governor route missing, add minimal `POST /v1/agents/money/tick` and `POST /v1/agents/money/handle-failure` as HTTP stand-ins for demo.

---

### Task 9: Money UI — Ledger, Audit explorer, Demo controls

**Files:**
- Create: `apps/web/src/components/money/LedgerView.tsx`
- Create: `apps/web/src/components/money/AuditExplorer.tsx`
- Create: `apps/web/src/components/money/DemoControls.tsx`
- Modify: `apps/web/src/lib/api.ts`, `console-context.tsx`, `Console.tsx`, `NavRail.tsx`, `icons.tsx`

**Interfaces:**

```ts
export type ConsoleView = "inbox" | "graph" | "orders" | "inventory" | "money" | "policy";

export async function fetchLedger(): Promise<LedgerSummary>;
export async function simulateWebhook(body: { event: string; paymentKey?: string }): Promise<void>;
export async function fetchAuditFiltered(params: {
  actor?: string;
  sideEffectClass?: string;
  minAmountPaise?: number;
  limit?: number;
}): Promise<AuditEventDto[]>;
```

- [ ] **NavRail:** `money` → view `"money"`, `IconMoney`, label `"Money"`, enabled. Remove `money: "policy"` mapping.

- [ ] **LedgerView:** fetch `/v1/ledger`; render summary + table; header link `Policies →` calls `setView("policy")`.

- [ ] **AuditExplorer:** filter chips update query; highlight chain: `payment_link.created` → `payment_link.expired` → `money.failure_detected` → `approval.created` → `approval.resolved` → `payment_link.created` (retry).

- [ ] **DemoControls:** button calls `simulateWebhook({ event: "payment_link.expired", paymentKey: "Payment:plink_7" })` then `reload()` console context.

---

### Task 10: Agent rail — tool trace + failure impact

**Files:**
- Create: `apps/web/src/components/agent/ToolTrace.tsx`
- Create: `apps/web/src/components/agent/FailureImpactBlock.tsx`
- Modify: `AgentRail.tsx`, `ApprovalCardList.tsx`, `ApprovalCard.tsx`

**Interfaces:**

```ts
export type ToolTraceRow = {
  id: string;
  tool: string;
  status: "running" | "done" | "error";
  summary: string;
  at: string;
};

// Poll GET /v1/audit?actor=agent:money&limit=10 OR new GET /v1/agents/trace
```

- [ ] **ApprovalCardList** titles for `money.recovery`:

```ts
if (action === "money.recovery") {
  const opt = approval.proposedAction.metadata?.option;
  if (opt === "retry_link") return "Retry Payment Link for INV-90";
  if (opt === "hold_stock_48h") return "Hold stock 48h for SO-218";
  if (opt === "release_to_lead") return "Release stock to IG-Ananya";
}
```

- [ ] **FailureImpactBlock:** render when any pending approval has action `money.recovery` — fetch `GET /v1/impact?key=Payment:plink_7` optional enrichment; prefer `why` field from approval.

- [ ] **ToolTrace:** map recent audit events `event_type` starting with `money.` or `collections.` to rows.

---

### Task 11: Inbox + exception highlight

**Files:**
- Modify: `apps/web/src/components/inbox/ExceptionList.tsx`

- [ ] Rows with `code === "payment.failure"` use `bg-risk/10` and `border-l-risk`.
- [ ] Click focuses graph on payment node (`focusNode` via nodeKeyById).
- [ ] After simulate, exception count badge on Inbox nav increases (bootstrap reload).

---

### Task 12: Command palette + Policy access

**Files:**
- Modify: `apps/web/src/components/command/commands.ts`

- [ ] Add commands: `Open Policy Studio` → `setView("policy")`; `Simulate INV-90 payment failure` → simulate + `setView("inbox")`; `Run collections loop` → POST admin run-collections.

---

### Task 13: Integration tests + demo script

**Files:**
- Complete all tests listed above

**Demo script (engineer runs locally — 5-minute video step 5):**

```bash
# 0. Seed + start
curl -X POST http://localhost:4000/v1/admin/seed -H "x-org-id: org_arka"

# 1. Run collections (optional if link already sent)
curl -X POST http://localhost:4000/v1/admin/run-collections -H "x-org-id: org_arka"

# 2. Force failure — the demo button
curl -X POST http://localhost:4000/v1/admin/simulate-webhook \
  -H "x-org-id: org_arka" -H "Content-Type: application/json" \
  -d '{"event":"payment_link.expired","paymentKey":"Payment:plink_7"}'

# 3. Verify impact
curl -H "x-org-id: org_arka" http://localhost:4000/v1/exceptions
curl -H "x-org-id: org_arka" "http://localhost:4000/v1/audit?sideEffectClass=money&limit=20"

# 4. Web: Inbox red, agent rail shows 3 recovery cards, approve Retry
# 5. Ledger shows expired + new sent link; audit explorer shows full chain
```

Run: `pnpm -r test` (graph, seed, agents, razorpay, api, web)

---

## Approval card content (demo-locked copy)

When `payment_link.expired` fires on INV-90, the **retry_link** card must show:

- **Title:** `Retry Payment Link for INV-90`
- **Amount:** `₹14,800` (mono teal)
- **Why:** `Lotus Boutique's Payment Link for INV-90 (₹14,800) expired. SO-218's 8× Diya-Large promised Friday remain reserved (9 units held at Workshop). Lead IG-Ananya is waiting on the same SKU. Issuing a new link gives Lotus another chance to pay without releasing stock.`
- **Policy:** `Policy: Money recovery · require approval`
- **Buttons:** `Approve` / `Edit` / `Reject`

`Edit` focuses graph on `SalesOrder:SO-218` (locked in ApprovalCardList via `targetNodeKey` or first `impactNodeKeys` entry).

Test: snapshot or string assert in `ApprovalCard.test.tsx` for rendered why paragraph containing `SO-218` and `IG-Ananya`.

---

## Done when

- `POST /v1/admin/simulate-webhook` with `payment_link.expired` updates `Payment:plink_7` → expired, creates audit Event, raises `payment.failure` exception.
- Money agent collections loop respects 3-nudge stopping rule; escalated invoice appears in Inbox.
- `Policy:collect.invoice` allow path auto-creates link with `agent:money` actor + mandate audit trail.
- Failure handler creates three `money.recovery` approvals with graph-backed why copy.
- Approving `retry_link` creates a **new** Payment Link (new Razorpay id / node key) without duplicating charge on old link.
- `GET /v1/ledger` returns payments in + payouts out summary from graph Payment nodes.
- Money nav shows ledger + audit explorer with actor / side-effect / amount filters.
- Inbox visually escalates payment failure (risk styling); agent rail shows tool trace + approval cards.
- Demo script above completes end-to-end on seeded Arka world.
- All new tests pass; no TBD on failure classification, nudge limit, or recovery options.

## Out of scope (step 8+)

Sourcing agent, browser sandbox, Comms auto-send of collection email (draft only in step 9), live RazorpayX payouts, GST e-invoice, WhatsApp, AWS deploy, pitch video, reconciliation match UI (ledger exception list is step 10 polish).

---

## Self-review

- Spec §7.6 Failure is a feature — Tasks 3, 6, 10; simulate webhook + recovery approvals + audit.
- Spec §8.5 Money — ledger, payout propose path, Payment Links (Step 3 + retry).
- Spec §8.6 Collections — Task 4 loop, nudge limits, escalate to Inbox.
- Spec §9.2 Razorpay bar — explainable (impact copy), bounded (policy), gated (approvals), audit (explorer), failure handled (full loop).
- Spec §11 demo step 5 — demo narrative table at top maps beats to code.
- Spec §14 item 7 — money agent + collections + forced failure.
- Builds on Step 3 webhooks/audit, Step 4 approvals, Step 5 Governor tools (with HTTP fallbacks if needed).
- API shapes, recovery options, nudge limit, and approval card copy locked — no TBD.
- Double-charge prevented via retry idempotency key suffix.
- Policy Studio retained via command palette when Money nav restored to ledger.
