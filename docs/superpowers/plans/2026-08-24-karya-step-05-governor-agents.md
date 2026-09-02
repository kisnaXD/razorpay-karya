# Karya Step 5 — Governor Agent + Inventory Promise Query + Sales Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire a single **Governor** agent (Vercel AI SDK tool loop) that talks to the operator through the AgentRail, routes work via four tool namespaces (graph read, inventory, sales, money), runs **promise queries** against GraphStore, exposes an order book + accept/reject order writes, and integrates Approval cards into the tool loop when money moves.

**Architecture:** `packages/agents` owns the Governor loop and Zod tool schemas. Tool executors call existing `@karya/graph`, `@karya/policy`, and API services (`inventory`, `sales`, `payment-links`, `approvals`, `audit`). Agent thread state persists in Mongo `agent_threads` (one active thread per org). `apps/api` exposes `/v1/agent/*` and `/v1/inventory/promise`. `apps/web` AgentRail becomes a live thread: user messages, stacked tool traces (copper while running), Approval cards that unblock the loop on resolve.

**Tech Stack:** TypeScript 5.8 strict, Vercel AI SDK `ai` ^4 + `@ai-sdk/openai` (or `@ai-sdk/anthropic` if key present — locked default: OpenAI `gpt-4o-mini` for cost), Zod 3, Fastify 5, MongoDB native driver, Vitest, existing `@karya/graph`, `@karya/policy`, `@karya/razorpay`, Step 4 approval/policy services.

## Global Constraints

From spec §7, §8.3–8.4, §8.5 and Steps 1–4.

- **One Governor, not nine agents.** Specialist roles from spec §7.1 are **tool namespaces** exposed to a single model loop. Do not spawn separate LLM instances per role.
- **Operational truth is the graph.** Tools query GraphStore; chat history is conversation only. Tool outputs must cite node keys.
- **Side-effect classes are mandatory** on every tool: `read` | `draft` | `write` | `money` | `external`. Step 5 implements `read`, `draft`, `write`, `money` only — no `external` tools yet.
- **Policy before side effects:** `money` tools always call `evaluateAction` before execution. `require_approval` → create ApprovalRecord, pause thread, surface card. `deny` → tool returns error to model. `allow` → execute immediately.
- **`write` tools** (accept/reject order, reserve stock) log `writeAuditEvent` with `sideEffectClass: "write"`. No policy gate in Step 5 except money.
- **Governor never calls Razorpay directly.** Money tool delegates to `createPaymentLinkForInvoice` service (Step 3).
- **Tool traces in UI:** stacked rows, 120–180ms transitions, copper accent while `running`, muted when `done` (spec §5.6). No typewriter theatrics.
- **Explanation string required** on every tool call input (`explanation: string`). Zod schemas enforce min length 8.
- **Closed graph schema.** Tools accept node keys (`SKU:Diya-Large`), never invent types or edges.
- **Env:** `OPENAI_API_KEY` required for agent routes in dev. If missing, API returns 503 `{ error: "llm_not_configured" }` and AgentRail shows designed fallback copy — not a crash.
- UI tokens unchanged. No shadcn. Agent copy: sharp ops lead, short, numbered choices.
- Tests: promise query against seeded Arka subgraph; accept order reserves stock; Governor tool loop mocked (no live LLM in CI).

---

## File structure (this step creates / modifies)

```
packages/agents/package.json
packages/agents/tsconfig.json
packages/agents/src/index.ts
packages/agents/src/types.ts                 ThreadEntry, ToolContext, SideEffectClass
packages/agents/src/governor.ts              streamText tool loop
packages/agents/src/system-prompt.ts
packages/agents/src/tools/index.ts           buildTools(ctx)
packages/agents/src/tools/graph.ts
packages/agents/src/tools/inventory.ts
packages/agents/src/tools/sales.ts
packages/agents/src/tools/money.ts
packages/agents/src/tools/schemas.ts         shared Zod helpers
packages/agents/src/promise.ts               promise query pure function
packages/agents/src/promise.test.ts
packages/agents/src/governor.test.ts         mocked generateText/streamText

apps/api/package.json                        add @karya/agents, ai, @ai-sdk/openai
apps/api/src/env.ts                          OPENAI_API_KEY, OPENAI_MODEL (modify)
apps/api/src/mongo.ts                        agent_threads collection + indexes (modify)
apps/api/src/app.ts                          register agent + inventory routes (modify)
apps/api/src/services/inventory.ts           promiseQuery wrapper
apps/api/src/services/sales.ts               order book, quote, accept/reject
apps/api/src/services/agent-thread.ts        CRUD thread, append entries
apps/api/src/services/agent-runner.ts        runGovernorTurn, resumeAfterApproval
apps/api/src/routes/agent.ts
apps/api/src/routes/inventory.ts
apps/api/src/test/inventory.test.ts
apps/api/src/test/sales.test.ts
apps/api/src/test/agent.test.ts

apps/web/package.json                        add ai (for readDataStream if needed)
apps/web/src/lib/api.ts                      agent + promise types (modify)
apps/web/src/lib/agent-context.tsx           thread state, sendMessage, poll
apps/web/src/components/agent/AgentThread.tsx
apps/web/src/components/agent/ToolTraceRow.tsx
apps/web/src/components/agent/AgentMessageInput.tsx
apps/web/src/components/agent/ToolTraceRow.test.tsx
apps/web/src/components/agent/ApprovalCardList.tsx  onResolved → resume agent (modify)
apps/web/src/components/shell/AgentRail.tsx  live thread (modify)
.env.example                                 OPENAI_API_KEY, OPENAI_MODEL (modify)
```

No `apps/worker` yet. No `/a2a`, Buyer Agent, Sourcing browser, Comms drafts.

---

## Side-effect classes and tool catalog (locked)

| Tool name | Namespace | Class | Policy check | Graph write |
|---|---|---|---|---|
| `graph_get_neighborhood` | graph | read | no | no |
| `graph_find_path` | graph | read | no | no |
| `graph_get_impact` | graph | read | no | no |
| `graph_list_exceptions` | graph | read | no | no |
| `inventory_promise_query` | inventory | read | no | no |
| `inventory_check_stock` | inventory | read | no | no |
| `sales_get_order_book` | sales | read | no | no |
| `sales_generate_quote` | sales | draft | no | no |
| `sales_accept_order` | sales | write | no | yes (SO + edges + reserve) |
| `sales_reject_order` | sales | write | no | yes (status cancel) |
| `money_create_payment_link` | money | money | yes | yes (via payment-links svc) |

Governor system prompt lists these tools grouped under **Graph · Inventory · Sales · Money** headings. Model must pick tools, not role-play separate agents.

---

## Promise query result (locked)

Pure function in `packages/agents/src/promise.ts` — shared by tool and `POST /v1/inventory/promise`.

```ts
export type PromiseVerdict = "yes" | "yes_if" | "no";

export type PromiseQueryInput = {
  orgId: string;
  skuKey: string;           // e.g. "SKU:Diya-Large"
  qty: number;              // integer ≥ 1
  promiseDate?: string;     // ISO date or display string e.g. "Friday"
  excludeSalesOrderKey?: string; // when re-evaluating existing SO
};

export type PromiseBlocker = {
  kind: "stock" | "material" | "shipment" | "purchase_order";
  nodeKey: string;
  label: string;
  detail: string;
};

export type PromiseQueryResult = {
  verdict: PromiseVerdict;
  skuKey: string;
  skuLabel: string;
  qty: number;
  available: number;        // sum(on_hand - reserved) across Stock nodes for SKU
  inbound: number;          // max additional units from open POs/shipments via MADE_FROM
  shortfall: number;        // max(0, qty - available - inbound)
  blockers: PromiseBlocker[];
  summary: string;          // one sentence for agent + UI
};
```

**Algorithm (must match `packages/graph/src/exceptions.ts` `stockPromiseRisk` logic, inverted for prospective qty):**

1. Load SKU node by key; 404 if missing.
2. Sum `available` from all `Stock` nodes with `STOCK_OF → SKU`: `on_hand - reserved`.
3. Walk `MADE_FROM` edges (SKU → Material). For each material, find open `PurchaseOrder` lines (`ORDER_CONTAINS → Material`) where PO status ∉ `{ received, cancelled }`.
4. For each open PO, compute `inboundSkuUnits = poQtyKg / kgPerUnit` from `MADE_FROM.props.qty`.
5. If PO has `FULFILLS` from delayed `Shipment`, still count inbound but add blocker `{ kind: "purchase_order", ... }` and `{ kind: "shipment", ... }`.
6. If PO has no shipment yet, count full inbound; blocker on PO if status `late`.
7. **Verdict:**
   - `qty <= available` → `yes`, summary e.g. `"8× Diya-Large available now (3 free after existing reservations)."`
   - `qty <= available + inbound` → `yes_if`, summary names blocking PO/shipment.
   - else → `no`, summary states shortfall.
8. Seeded demo: `inventory_promise_query({ skuKey: "SKU:Diya-Large", qty: 8 })` on fresh seed → **`yes_if`** (12 on hand, 9 reserved → 3 available; inbound from PO-104 covers gap; PO-104 late).

Implementation loads graph via injected callbacks:

```ts
export async function promiseQuery(
  input: PromiseQueryInput,
  loadGraph: () => Promise<{ nodes: NodeRecord[]; edges: EdgeRecord[] }>,
  getNodeByKey: (key: string) => Promise<NodeRecord | null>,
): Promise<PromiseQueryResult>;
```

---

## Agent thread persistence (locked)

Collection: `agent_threads`

```ts
export type ToolTraceStatus =
  | "running"
  | "done"
  | "error"
  | "awaiting_approval";

export type SideEffectClass =
  | "read"
  | "draft"
  | "write"
  | "money"
  | "external";

export type ThreadEntry =
  | {
      id: string;
      kind: "user";
      content: string;
      contextNodeKey: string | null;
      createdAt: string;
    }
  | {
      id: string;
      kind: "assistant";
      content: string;
      createdAt: string;
    }
  | {
      id: string;
      kind: "tool";
      toolName: string;
      sideEffectClass: SideEffectClass;
      status: ToolTraceStatus;
      explanation: string;
      input: Record<string, unknown>;
      output: unknown | null;
      error: string | null;
      approvalId: string | null;
      createdAt: string;
      completedAt: string | null;
    };

export type AgentThread = {
  _id: string;              // thread_org_arka (one per org in MVP)
  orgId: string;
  entries: ThreadEntry[];
  pending: {
    approvalId: string;
    toolEntryId: string;
    resumePayload: Record<string, unknown>; // serialized tool input for money tool
  } | null;
  updatedAt: Date;
};
```

Indexes: `{ orgId: 1 }` unique.

Entry IDs: `entry_` + ulid.

---

## Tool Zod schemas (locked JSON shapes)

All tools extend base:

```ts
const explanationField = z
  .string()
  .min(8)
  .describe("One sentence why this tool is being called — shown in audit and UI.");
```

### Graph tools

```ts
// graph_get_neighborhood
{ nodeKey: string; depth: 1 | 2; explanation: string }

// graph_find_path
{ fromKey: string; toKey: string; explanation: string }

// graph_get_impact
{ nodeKey: string; explanation: string }

// graph_list_exceptions
{ explanation: string }
```

### Inventory tools

```ts
// inventory_promise_query
{
  skuKey: string;
  qty: number;          // z.number().int().positive()
  promiseDate?: string;
  explanation: string;
}

// inventory_check_stock
{ skuKey: string; explanation: string }
// returns { skuKey, onHand, reserved, available, stockNodeKeys[] }
```

### Sales tools

```ts
// sales_get_order_book
{
  status?: "open" | "reserved" | "promised" | "packing" | "shipped" | "cancelled";
  explanation: string;
}

// sales_generate_quote
{
  skuKey: string;
  qty: number;
  customerOrgKey?: string;
  explanation: string;
}
// returns { lineItems, subtotalInPaise, gstInPaise, totalInPaise, marginNote }

// sales_accept_order
{
  customerOrgKey: string;   // Org:Lotus-Boutique
  skuKey: string;
  qty: number;
  promiseDate: string;
  explanation: string;
}
// returns { salesOrderKey, reservedQty, promiseQuery: PromiseQueryResult }

// sales_reject_order
{
  salesOrderKey: string;
  reason: string;
  explanation: string;
}
```

### Money tool

```ts
// money_create_payment_link
{
  invoiceKey: string;       // Invoice:INV-90
  explanation: string;
}
// returns { status: "created" | "awaiting_approval" | "denied" | "exists"; paymentKey?; approvalId?; shortUrl? }
```

---

## Sales service signatures (locked)

`apps/api/src/services/sales.ts`

```ts
export type OrderBookRow = {
  key: string;
  label: string;
  status: string;
  customerOrgKey: string | null;
  customerLabel: string | null;
  promiseDate: string | null;
  lines: Array<{ skuKey: string; skuLabel: string; qty: number }>;
  invoiceKey: string | null;
  amountInPaise: number | null;
};

export async function getOrderBook(
  store: GraphStore,
  orgId: string,
  filter?: { status?: string },
): Promise<OrderBookRow[]>;

export type QuoteResult = {
  skuKey: string;
  qty: number;
  unitPriceInPaise: number;
  subtotalInPaise: number;
  gstRate: number;
  gstInPaise: number;
  totalInPaise: number;
  materials: Array<{ materialKey: string; qtyPerUnit: number; uom: string }>;
};

export async function generateQuote(
  store: GraphStore,
  orgId: string,
  input: { skuKey: string; qty: number; customerOrgKey?: string },
): Promise<QuoteResult>;

export async function acceptSalesOrder(
  store: GraphStore,
  orgId: string,
  audit: typeof writeAuditEvent,
  input: {
    customerOrgKey: string;
    skuKey: string;
    qty: number;
    promiseDate: string;
    actor: string;
  },
): Promise<{
  salesOrder: NodeRecord;
  promiseResult: PromiseQueryResult;
}>;

export async function rejectSalesOrder(
  store: GraphStore,
  orgId: string,
  audit: typeof writeAuditEvent,
  input: { salesOrderKey: string; reason: string; actor: string },
): Promise<NodeRecord>;
```

**acceptSalesOrder writes (idempotent keys):**

1. Run `promiseQuery`; if `verdict === "no"` throw `PromiseRejectedError` with result (Governor explains to operator).
2. Upsert `SalesOrder:SO-{ulid}` with `status: "promised"`, `promise_date`, `channel: "agent"`.
3. Edges: `customerOrg BUYS SO`, `SO ORDER_CONTAINS SKU { qty }`.
4. Increment `Stock.props.reserved` on all `Stock` nodes for SKU (proportional if multiple stock nodes — locked: increment first stock node only in MVP, document in code comment).
5. `writeAuditEvent` `sales.order_accepted` about SO + SKU + Stock.

**rejectSalesOrder:** set `status: "cancelled"`, release reserved qty from `ORDER_CONTAINS` lines (decrement reserved, floor 0).

---

## Governor loop (locked)

`packages/agents/src/governor.ts`

```ts
import { streamText, tool, type CoreTool } from "ai";
import { openai } from "@ai-sdk/openai";

export type GovernorDeps = {
  model: string;                    // env OPENAI_MODEL default gpt-4o-mini
  orgId: string;
  actor: string;                    // agent:governor
  contextNodeKey: string | null;
  threadEntries: ThreadEntry[];     // prior conversation for messages[]
  tools: Record<string, CoreTool>;
  onToolStart: (entry: ThreadEntry) => Promise<void>;
  onToolFinish: (entryId: string, update: Partial<ThreadEntry>) => Promise<void>;
};

export type GovernorTurnResult = {
  assistantText: string;
  newEntries: ThreadEntry[];
  pendingApproval: AgentThread["pending"];
};

export async function runGovernorTurn(
  deps: GovernorDeps,
  userMessage: string,
): Promise<GovernorTurnResult>;
```

**Behavior:**

1. Build messages from thread: map `user`/`assistant` entries to AI SDK message format. Tool entries are **not** sent as messages — they appear only in UI traces.
2. System prompt from `system-prompt.ts` includes: role (Governor ops lead), tool namespace list, policy rule (“never execute money without approval when policy says so”), graph key format, Arka context hint.
3. `streamText({ model: openai(deps.model), tools: deps.tools, maxSteps: 8, system, messages })`.
4. For each tool invocation:
   - Append `tool` entry with `status: "running"`.
   - Execute handler from `buildTools`.
   - On success → `status: "done"`, store output.
   - On throw → `status: "error"`, store error message.
5. Collect final assistant text from stream.
6. Return all new entries.

**Resume after approval** (`runGovernorResume`):

- Load pending tool input from thread.
- If approval `approved` → re-run money tool executor with `skipPolicy: true` (approval is the gate).
- If `rejected` → append assistant message “Payment link not sent — you rejected the approval.” Clear pending.
- Append tool entry completion; optionally one more `runGovernorTurn` with synthetic user message `"Approval resolved: approved|rejected"` — locked: **no second LLM call**; assistant confirmation is templated string, not another model turn.

---

## API routes (locked)

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/v1/agent/thread` | | `{ thread: AgentThread }` — create empty if missing |
| POST | `/v1/agent/message` | `{ message: string; contextNodeKey?: string }` | SSE stream (see below) |
| POST | `/v1/agent/resume` | `{ approvalId: string }` | `{ thread: AgentThread; assistantMessage: string }` |
| POST | `/v1/inventory/promise` | `{ skuKey, qty, promiseDate?, excludeSalesOrderKey? }` | `{ result: PromiseQueryResult }` |

**Headers:** `x-org-id` required. Optional `x-actor` (default `human:anika@arka.atelier`). Agent messages set actor on audit as `agent:governor`.

**POST /v1/agent/message SSE events** (newline-delimited JSON):

```ts
{ "type": "thread", "thread": AgentThread }           // after each tool start/finish
{ "type": "text-delta", "delta": string }           // assistant tokens
{ "type": "done", "thread": AgentThread }             // final
{ "type": "error", "message": string }
```

Implementation: Fastify `@fastify/cors` already set. Route sets `Content-Type: text/event-stream`, `Cache-Control: no-cache`. Use `runGovernorTurn` internally; push thread snapshots on tool events.

If `OPENAI_API_KEY` missing → 503.

**POST /v1/inventory/promise** — thin wrapper calling `inventory.ts` service (same logic as tool). Usable from curl and Governor tool.

---

## Money tool + approval integration (locked)

`packages/agents/src/tools/money.ts` handler:

```ts
async function executeCreatePaymentLink(input, ctx: ToolContext) {
  const proposed: ProposedAction = {
    action: "collect.invoice",
    orgId: ctx.orgId,
    targetNodeKey: input.invoiceKey,
    amountInPaise: /* load from invoice */,
    explanation: input.explanation,
    proposedBy: "agent:governor",
  };
  const evaluation = await ctx.evaluateAction(proposed);

  await ctx.writeAudit({
    eventType: "policy.evaluated",
    sideEffectClass: "read",
    payload: { proposed, evaluation },
  });

  if (evaluation.finalDecision === "deny") {
    return { status: "denied", evaluation };
  }

  if (evaluation.finalDecision === "require_approval") {
    const { approval } = await ctx.createApproval(proposed);
    return {
      status: "awaiting_approval",
      approvalId: approval._id,
      message: "Approval card created. Execution continues when operator approves.",
    };
  }

  // allow
  const result = await ctx.createPaymentLink({ invoiceKey: input.invoiceKey });
  return { status: "created", paymentKey: result.paymentNode.key, shortUrl: result.razorpay.short_url };
}
```

`ToolContext` (constructed in `agent-runner.ts`):

```ts
export type ToolContext = {
  orgId: string;
  store: GraphStore;
  db: Db;
  env: Env;
  evaluateAction: typeof evaluateAction;
  createApproval: typeof createApproval;
  createPaymentLink: typeof createPaymentLinkForInvoice;
  writeAudit: typeof writeAuditEvent;
  promiseQuery: typeof promiseQuery;
  getOrderBook: typeof getOrderBook;
  generateQuote: typeof generateQuote;
  acceptSalesOrder: typeof acceptSalesOrder;
  rejectSalesOrder: typeof rejectSalesOrder;
};
```

On `awaiting_approval`, Governor runner sets `thread.pending` and tool entry `status: "awaiting_approval"`.

**ApprovalCardList change:** after successful `resolveApproval`, if response includes approved status, call `POST /v1/agent/resume { approvalId }`.

---

### Task 1: `packages/agents` scaffold + promise query

**Files:**
- Create: `packages/agents/package.json`, `tsconfig.json`, `src/index.ts`, `src/types.ts`, `src/promise.ts`
- Test: `packages/agents/src/promise.test.ts`

**Interfaces:**
- Consumes: `@karya/graph` types
- Produces: `promiseQuery`, exported types

**Dependencies:**

```json
{
  "name": "@karya/agents",
  "dependencies": {
    "@karya/graph": "workspace:*",
    "@karya/policy": "workspace:*",
    "ai": "^4.3.0",
    "zod": "^3.24.0",
    "ulid": "^2.3.0"
  },
  "devDependencies": {
    "vitest": "^3.0.0",
    "mongodb-memory-server": "^10.1.0"
  }
}
```

- [ ] **Step 1: Tests first**

```ts
it("promise yes when qty fits available only", async () => { /* 12 on hand, 9 reserved, qty 3 → yes */ });
it("promise yes_if for 8× Diya-Large on seeded-shaped graph", async () => { /* mirrors SO-218 */ });
it("promise no when shortfall exceeds inbound", async () => { /* qty 100 */ });
it("names PO-104 blocker when brass inbound delayed", async () => { ... });
```

Run: `pnpm --filter @karya/agents test` → FAIL.

- [ ] **Step 2: Implement `promiseQuery` until PASS**

Run: `pnpm --filter @karya/agents test` → PASS.

---

### Task 2: Tool definitions + buildTools

**Files:**
- Create: `src/tools/schemas.ts`, `graph.ts`, `inventory.ts`, `sales.ts`, `money.ts`, `index.ts`
- Create: `src/system-prompt.ts`

**Interfaces:**

```ts
// tools/index.ts
import type { ToolContext } from "../types.js";

export function buildTools(ctx: ToolContext): Record<string, CoreTool> {
  return {
    graph_get_neighborhood: tool({ description: "...", parameters: z.object({...}), execute: async (input) => { ... } }),
    // ... all 11 tools
  };
}

export const TOOL_SIDE_EFFECTS: Record<string, SideEffectClass> = { ... };
```

Graph read tools wrap `store.neighborhood`, `store.path`, `store.impact`, `store.exceptions` — return `{ nodes: { key, type, label }[], edges: { type, fromKey, toKey }[] }` with keys not internal IDs.

- [ ] **Step 1: Implement graph + inventory tools** (read only)

- [ ] **Step 2: Implement sales tools** — sales service calls injected via ctx (Task 3)

- [ ] **Step 3: Implement money tool** with policy branching (mock ctx in unit test)

Test: `packages/agents/src/tools.test.ts` optional; at minimum governor.test mocks one tool call.

---

### Task 3: Sales + inventory API services

**Files:**
- Create: `apps/api/src/services/inventory.ts`
- Create: `apps/api/src/services/sales.ts`
- Create: `apps/api/src/routes/inventory.ts`
- Test: `apps/api/src/test/inventory.test.ts`, `apps/api/src/test/sales.test.ts`

**Interfaces:**

```ts
// inventory.ts
export async function runPromiseQuery(
  store: GraphStore,
  orgId: string,
  input: Omit<PromiseQueryInput, "orgId">,
): Promise<PromiseQueryResult> {
  return promiseQuery(
    { orgId, ...input },
    async () => {
      const nodes = await store.listNodes(orgId);
      const edges = /* load current edges — add GraphStore.listEdges(orgId) helper */;
      return { nodes, edges };
    },
    (key) => store.getNodeByKey(orgId, key),
  );
}
```

**GraphStore addition (locked):** add method:

```ts
async listEdges(orgId: string, filter?: GraphFilter): Promise<EdgeRecord[]>;
```

Returns all edges matching `edgeActiveQuery`. Used by promise query and exception parity.

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/v1/inventory/promise` | `{ skuKey, qty, promiseDate?, excludeSalesOrderKey? }` | `{ result }` |
| GET | `/v1/sales/orders` | `?status=` | `{ orders: OrderBookRow[] }` |
| POST | `/v1/sales/quote` | `{ skuKey, qty, customerOrgKey? }` | `{ quote: QuoteResult }` |
| POST | `/v1/sales/accept` | `{ customerOrgKey, skuKey, qty, promiseDate }` | `{ salesOrder, promiseResult }` |
| POST | `/v1/sales/reject` | `{ salesOrderKey, reason }` | `{ salesOrder }` |

Sales routes require `x-actor` header for audit. Register in `app.ts`.

- [ ] **Step 1: Add `listEdges` to GraphStore + test**

- [ ] **Step 2: Implement services + routes + tests**

Manual check:

```
curl -X POST http://localhost:4000/v1/inventory/promise \
  -H "x-org-id: org_arka" -H "Content-Type: application/json" \
  -d '{"skuKey":"SKU:Diya-Large","qty":8}'
# expect verdict yes_if, blocker PO-104
```

---

### Task 4: Agent thread service + Governor runner

**Files:**
- Create: `apps/api/src/services/agent-thread.ts`
- Create: `apps/api/src/services/agent-runner.ts`
- Create: `apps/api/src/routes/agent.ts`
- Modify: `apps/api/src/mongo.ts`, `apps/api/src/env.ts`, `apps/api/src/app.ts`
- Test: `apps/api/src/test/agent.test.ts`

**env.ts additions:**

```ts
OPENAI_API_KEY: z.string().optional(),
OPENAI_MODEL: z.string().default("gpt-4o-mini"),
```

`.env.example`:

```
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

**agent-thread.ts:**

```ts
export async function getOrCreateThread(db: Db, orgId: string): Promise<AgentThread>;
export async function appendEntry(db: Db, orgId: string, entry: ThreadEntry): Promise<AgentThread>;
export async function updateToolEntry(db: Db, orgId: string, entryId: string, patch: Partial<ThreadEntry>): Promise<AgentThread>;
export async function setPending(db: Db, orgId: string, pending: AgentThread["pending"]): Promise<AgentThread>;
export async function clearPending(db: Db, orgId: string): Promise<AgentThread>;
```

**agent-runner.ts:**

```ts
export async function handleAgentMessage(
  db: Db,
  store: GraphStore,
  env: Env,
  orgId: string,
  input: { message: string; contextNodeKey?: string; actor: string },
  onEvent: (event: AgentStreamEvent) => void,
): Promise<AgentThread>;

export async function resumeAfterApproval(
  db: Db,
  store: GraphStore,
  env: Env,
  orgId: string,
  approvalId: string,
): Promise<{ thread: AgentThread; assistantMessage: string }>;
```

Wire `buildTools` with real services. Use `runGovernorTurn` from `@karya/agents`.

- [ ] **Step 1: Thread CRUD + GET /v1/agent/thread test**

- [ ] **Step 2: POST /v1/agent/message with mocked OpenAI** (inject model in test)

- [ ] **Step 3: Resume flow test** — create pending approval, resolve, resume executes payment link mock

---

### Task 5: Governor system prompt

**Files:**
- Create: `packages/agents/src/system-prompt.ts`

**Locked content outline:**

```ts
export function buildSystemPrompt(ctx: {
  orgLabel: string;
  contextNodeKey: string | null;
  exceptionCount: number;
}): string;
```

Include:

- You are the Governor for {orgLabel}. Speak like a sharp ops lead.
- Four tool groups: Graph, Inventory, Sales, Money.
- Always use node keys in answers.
- For “can we take this order” → `inventory_promise_query`.
- For order book → `sales_get_order_book`.
- Money actions may require operator approval; say so when tool returns `awaiting_approval`.
- If `contextNodeKey` set, prefer it in graph tools.

No markdown headers in model output unless listing options.

- [ ] **Step 1: Snapshot test** — prompt contains tool names and policy hint

---

### Task 6: Web AgentRail live thread

**Files:**
- Create: `apps/web/src/lib/agent-context.tsx`
- Create: `apps/web/src/components/agent/AgentThread.tsx`
- Create: `apps/web/src/components/agent/ToolTraceRow.tsx`
- Create: `apps/web/src/components/agent/AgentMessageInput.tsx`
- Test: `apps/web/src/components/agent/ToolTraceRow.test.tsx`
- Modify: `apps/web/src/components/shell/AgentRail.tsx`
- Modify: `apps/web/src/components/agent/ApprovalCardList.tsx`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/layout.tsx` or `Console.tsx` — wrap with `AgentProvider`

**api.ts additions:**

```ts
export type AgentThreadDto = { /* mirror AgentThread, ISO dates */ };

export async function fetchAgentThread(): Promise<AgentThreadDto>;
export async function sendAgentMessage(
  message: string,
  contextNodeKey?: string,
  onEvent?: (ev: AgentStreamEvent) => void,
): Promise<AgentThreadDto>;
export async function resumeAgent(approvalId: string): Promise<{ thread: AgentThreadDto; assistantMessage: string }>;
```

`sendAgentMessage` uses `fetch` with `ReadableStream` reader; parses SSE JSON lines.

**ToolTraceRow props (locked):**

```tsx
export type ToolTraceRowProps = {
  toolName: string;
  sideEffectClass: SideEffectClass;
  status: ToolTraceStatus;
  explanation: string;
  outputSummary?: string;   // truncated JSON or summary string
};
```

Styles:

- Container: `border border-line bg-surface px-3 py-2 text-[12px]`
- `running`: `border-l-[3px] border-l-copper`
- `done`: `border-l-[3px] border-l-line text-muted`
- `awaiting_approval`: `border-l-[3px] border-l-warn`
- `error`: `border-l-[3px] border-l-risk`
- Tool name: mono; explanation: muted one line

**AgentMessageInput props:**

```tsx
type AgentMessageInputProps = {
  disabled?: boolean;
  placeholder?: string;   // default: "Ask Governor…"
  onSend: (message: string) => void;
};
```

Enter submits; Shift+Enter newline. 44px min height textarea.

**AgentRail layout (locked):**

```
<header>Governor · copper border</header>
<AgentThread />           // scroll: user bubbles + assistant + ToolTraceRow
<ApprovalCardList />      // below thread, above input
<AgentMessageInput />
<footer>Money actions need approval when policy requires it.</footer>
```

Remove idle “Governor idle…” when thread has entries OR pending approvals OR loading.

Pass `contextNodeKey={selectedNodeKey}` from console context when sending messages.

**ApprovalCardList:** on approve → `resumeAgent(id)` then `agentContext.refresh()`.

- [ ] **Step 1: ToolTraceRow test** — renders copper border when running

- [ ] **Step 2: AgentProvider + fetch thread on mount**

- [ ] **Step 3: Wire send + stream updates to local thread state**

- [ ] **Step 4: Approval resume hook**

---

### Task 7: Console integration + demo script

**Files:**
- Modify: `apps/web/src/lib/console-context.tsx` — expose `selectedNodeKey` to AgentRail (already exists)

**Manual demo script (engineer must verify):**

1. Set `OPENAI_API_KEY` in `.env`. Restart API.
2. Open app. AgentRail loads empty thread.
3. Type: **“Can we accept 8 Diya-Large for Friday?”**
4. Observe: tool row `inventory_promise_query` runs copper → muted; assistant says **yes-if** with PO-104 named.
5. Type: **“Show open sales orders”** → `sales_get_order_book` trace; mentions SO-218.
6. Type: **“Send payment link for INV-90”** → `money_create_payment_link` → Approval card; Approve → resume → tool done + Payment node.
7. `curl POST /v1/inventory/promise` matches agent answer.

- [ ] **Step 1: Document demo in PR / commit message body**

Run: `pnpm --filter @karya/agents test && pnpm --filter @karya/api test && pnpm --filter @karya/web test`

---

## Done when

- `promiseQuery` tests pass; seeded `8× SKU:Diya-Large` returns `yes_if` with PO-104 blocker.
- `POST /v1/inventory/promise` and `inventory_promise_query` tool return identical results.
- `GET /v1/sales/orders` returns SO-218, SO-201 with correct statuses.
- `POST /v1/sales/accept` creates SalesOrder, reserves stock, writes audit event; rejects when promise is `no`.
- Governor responds via `POST /v1/agent/message` (SSE) with visible tool traces in Mongo thread.
- Money tool creates Approval card on `require_approval`; Approve → resume completes payment link (when Razorpay configured) or returns structured mock error when not.
- AgentRail shows message input, thread, tool rows (copper/muted), Approval cards; no idle-only state after first message.
- CI tests pass without live OpenAI key (mocked stream).
- No `/a2a`, Buyer Agent, Sourcing, Comms, or worker process.

## Out of scope (step 6+)

`/a2a` catalog + checkout + Buyer Agent panel, Money agent collections loop, forced payment failure demo, Sourcing + Playwright, Comms drafts, Calendar briefs, Listings generator, audit explorer UI, AWS deploy, Auth.js, multi-thread per user.

---

## Self-review

- Spec §7.1 specialist roles → single Governor with tool namespaces: Tasks 2, 5.
- Spec §7.2 tool side-effect classes + policy before money: Money tool + TOOL_SIDE_EFFECTS table.
- Spec §5.6 tool traces as stacked rows: Task 6 ToolTraceRow.
- Spec §8.3–8.4 promise query + order book + accept order: Tasks 1, 3.
- Spec §8.5 payment link via existing service: Money tool delegates to Step 3.
- Step 4 approval integration: resume flow Tasks 4, 6.
- Build sequence step 5: Governor + Inventory + Sales — covered; not step 6 `/a2a`.
- API shapes, Zod schemas, thread schema, promise algorithm, and component props locked — no TBD.
- `listEdges` GraphStore addition explicit for promise parity with exceptions engine.
