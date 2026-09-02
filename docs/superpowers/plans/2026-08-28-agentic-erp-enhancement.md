# Karya Agentic ERP Enhancement Plan

> **For agentic workers:** Use superpowers:executing-plans or superpowers:subagent-driven-development to implement phase-by-phase. Each phase is independently deployable (~30 min per Grok 4.5 agent). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Transform Karya from "ERP + chatbot" into a genuine **agentic ERP** — outcome-oriented, push-based, explainable, and progressively autonomous — while preserving the existing single-Governor architecture, graph store, policy engine, and approval flow.

**Architecture stance:** Keep **one Governor LLM** with domain tool namespaces (do not spawn separate LLM agents). Enhance intelligence via system prompt, enriched inbox payloads, memory retrieval, and a lightweight event loop in the API process. All operational truth remains in `@karya/graph`; agent memory and inbox enrichments live in MongoDB collections alongside existing `approvals` and `agent_threads`.

**Tech Stack (unchanged):** TypeScript 5.8, Fastify 5, Next.js, MongoDB, Vercel AI SDK, `@karya/graph`, `@karya/policy`, `@karya/agents`, Vitest.

---

## 1. Current State Audit

Mapped against the vision's **Six-Layer Feature Hierarchy**:

| Layer | Status | What exists today | Evidence |
|-------|--------|-------------------|----------|
| **1. Understand** | ✅ Strong | NL chat via `GovernorDock`, full graph read via `query_graph` / `list_all_data`, 22+ ERP module pages, command palette | `packages/agents/src/tools/graph-query.ts`, `apps/web/src/components/shell/GovernorDock.tsx`, `apps/web/src/components/Console.tsx` |
| **2. Observe** | ⚠️ Partial | Rule-based exception evaluation (7 codes), inbox UI with severity grouping, dashboard alert slice, exception count in bootstrap | `packages/graph/src/exceptions.ts`, `apps/web/src/components/inbox/ExceptionList.tsx`, `apps/api/src/routes/graph.ts` |
| **3. Reason** | ❌ Weak | Graph traversal (`graph_find_path`, `graph_get_impact`), material need explanation (`sourcing_explain_need`), payment failure impact copy (`money_impact_query`). No root-cause chains, forecasting, or cross-department margin analysis | `packages/agents/src/tools/index.ts`, `packages/agents/src/money/impact-copy.ts` |
| **4. Plan** | ❌ Missing | `maxSteps: 8` tool loop but no explicit goal decomposition, no multi-step action plans surfaced to user | `packages/agents/src/governor.ts` |
| **5. Act** | ✅ Strong | 30+ tools (inventory, sales, money, sourcing, comms, calendar, listings), policy-gated approvals, side-effect classes, batch collections loop | `packages/agents/src/tools/index.ts`, `apps/api/src/services/approvals.ts` |
| **6. Learn** | ❌ Missing | Audit log exists; approval rejection notes captured but not fed back; no org preferences or decision history | `apps/api/src/services/audit.ts` |

### Vision Principles — Current Coverage

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| 1 | From Screens to Outcomes | ⚠️ | Agent can act via tools, but inbox/dashboard are informational; user must initiate most workflows |
| 2 | Specialized Agents | ⚠️ | Single Governor with tool namespaces; no domain-specific reasoning modes or personas |
| 3 | Cross-Department Reasoning | ⚠️ | Graph tools enable it; system prompt doesn't require cross-module chains |
| 4 | Agent Inbox (push, exception-first) | ⚠️ | `ExceptionList` shows title + detail only; no What→Why→Recommend→Actions; no morning briefing |
| 5 | "Why?" as first-class | ⚠️ | Tool `explanation` fields, failure impact copy; no universal drill-down UI |
| 6 | Human-in-the-loop authority levels | ⚠️ | Policy engine (`allow` / `require_approval` / `deny`); `PolicyStudio` toggles policies but no per-action autonomy UI |
| 7 | Agent memory | ❌ | Not implemented |
| 8 | Learning from overrides | ❌ | `resolutionNote` on reject exists but unused by agent |
| 9 | Event-driven agents | ❌ | Exceptions computed on-demand at API read time; no background loop |
| 10 | Agent-generated dashboards/reports | ❌ | Static `DashboardPage` with hardcoded KPIs; report pages are static tables |
| 11 | Predictive→Prescriptive→Autonomous | ⚠️ L1–3 | L1 alerts ✅, L2 partial (`inventory_promise_query`, `stock.promise_risk`), L3 via agent tools ✅, L4–5 ❌ |
| 12 | Six layers | See table above | Understand + Act strong; Observe partial; Reason, Plan, Learn missing |

### Existing Assets to Reuse (do not reinvent)

- **Exception engine:** `evaluateExceptions()` — extend, don't replace
- **Policy engine:** `@karya/policy` + graph `Policy` nodes — extend rules for authority thresholds
- **Approval flow:** `createApproval` → UI card → `resolveApproval` → execute — wire inbox actions into this
- **Governor loop:** `runGovernorTurn` with tool tracing — add memory injection + richer prompt
- **Money collections:** `money_run_collections_loop`, `money_propose_collection` — template for batch inbox actions
- **Graph impact walks:** `graph_get_impact`, `walkPaymentFailureImpact` — pattern for root-cause chains

---

## 2. Gap Analysis (by impact)

| Priority | Gap | Impact | Effort |
|----------|-----|--------|--------|
| **P0** | Outcome-oriented agent behavior | Demo killer — transforms chat from Q&A to ops lead | Low (prompt + small tool) |
| **P0** | Smart Agent Inbox with actions | Makes "agentic ERP" visible without opening chat | Medium |
| **P1** | Cross-department root-cause reasoning | Differentiator for "Why is margin falling?" demo | Medium |
| **P1** | Event-driven proactive notifications | Push-based "Good morning" experience | Medium |
| **P2** | Agent memory + override learning | Credibility for "remembers preferences" story | Medium |
| **P2** | Dynamic reports in chat | "Give me a cash flow forecast" demo | Medium |
| **P3** | Authority level configuration UI | Completes human-in-the-loop story | Medium |
| **P3** | Agent-curated dashboard KPIs | Nice polish; static dashboard already works | Low–Medium |

**Hackathon focus:** P0 + P1 deliver the narrative arc. P2–P3 are stretch goals that compound demo depth.

---

## 3. Implementation Phases Overview

| Phase | Title | Est. | User-visible outcome |
|-------|-------|------|----------------------|
| **1** | Enhanced Agent Intelligence | ~30 min | Agent explains WHY, recommends actions, connects cross-module dots |
| **2** | Smart Agent Inbox | ~30 min | Inbox items show What→Why→Recommend→Action buttons; morning briefing |
| **3** | Agent Memory & Learning | ~30 min | Agent cites past decisions; learns from approval rejections |
| **4** | Event-Driven Proactive Agent | ~30 min | Background scan pushes new inbox items; badge count updates |
| **5** | Dynamic Reports & Dashboards | ~30 min | "Cash flow forecast" in chat; agent-curated KPI strip on dashboard |
| **6** | Authority Level Configuration | ~30 min | Settings UI: auto-approve POs under ₹50k, etc. |

Each phase ships independently. Later phases consume earlier APIs but degrade gracefully if skipped.

---

## Phase 1: Enhanced Agent Intelligence (~30 min)

**Goal:** Upgrade the Governor from tool-listing assistant to outcome-oriented ops lead with structured reasoning.

### Files to modify

#### `packages/agents/src/system-prompt.ts`

Replace the current tool-catalog prompt with an **outcome-first** structure:

```ts
export function buildSystemPrompt(ctx: {
  orgLabel: string;
  contextNodeKey: string | null;
  exceptionCount: number;
  memories?: string[];        // Phase 3 — optional, empty array in Phase 1
  briefingSummary?: string;   // Phase 2 — optional
}): string
```

**New prompt sections (locked copy structure):**

1. **Identity:** "You are the Governor for {orgLabel}. You take action, not just inform."
2. **Reasoning protocol (mandatory):**
   - Before any recommendation, state **Observation** (what you found via tools)
   - Then **Why it matters** (business impact in one sentence)
   - Then **Recommendation** (specific action with node keys)
   - Then **What I'll do** (which tool you'll call, or ask for approval)
3. **Proactive mode:** When `exceptionCount > 0`, open with: "I noticed {N} items need attention" and prioritize by severity.
4. **Cross-department reasoning:** When asked about margins, cash, or delays, chain: Finance → Procurement → Inventory → Sales using `graph_get_impact` and `query_graph` before answering.
5. **Domain lenses** (not separate agents — reasoning modes):
   - *Finance:* overdue invoices, collections, payment failures, ledger
   - *Procurement:* stockouts, late POs, vendor selection
   - *Sales:* pipeline, promise risk, stale orders
6. **Tool catalog** (condensed — keep existing list but demote to appendix)
7. **Never:** list 47 items without grouping; say "I don't have access" without calling `query_graph` first

#### `packages/agents/src/governor.ts`

- Increase `maxSteps` from `8` to `12` (allows multi-tool reasoning chains)
- Pass optional `memories` and `briefingSummary` into `buildSystemPrompt` (stub empty for Phase 1)

#### `packages/agents/src/tools/root-cause.ts` (NEW)

Pure graph function + tool wrapper for cross-department "why" chains.

```ts
export type RootCauseStep = {
  layer: "finance" | "procurement" | "inventory" | "sales";
  nodeKey: string;
  label: string;
  finding: string;
};

export type RootCauseResult = {
  question: string;
  steps: RootCauseStep[];
  summary: string;
  recommendedActions: Array<{
    label: string;
    toolHint: string;  // e.g. "sourcing_draft_po"
    nodeKey: string;
  }>;
};
```

**Supported question templates (hackathon scope — pattern match, not free-form LLM):**

| Trigger | Chain |
|---------|-------|
| `margin` / `profit` | SKU prices (SalesOrder lines) → Material costs (MADE_FROM + PO prices) → late POs |
| `cash` / `receivables` | Ledger receivables → overdue invoices → uncollected payments |
| `delay` / `late` + nodeKey | Shipment → PO → Material → affected SalesOrders |
| `stockout` / `low stock` | Stock levels → open SO demand → inbound POs → late shipments |

Implementation: walk graph edges (reuse patterns from `exceptions.ts` `stockPromiseRisk` and `walkPaymentFailureImpact`). No LLM inside — deterministic chain the Governor narrates.

#### `packages/agents/src/tools/schemas.ts`

Add:

```ts
export const rootCauseAnalysisSchema = z.object({
  question: z.string().min(3).describe("Natural language question, e.g. 'Why is margin falling?'"),
  focusNodeKey: z.string().optional().describe("Optional anchor node"),
  explanation: explanationField,
});
```

#### `packages/agents/src/tools/index.ts`

Register:

```ts
root_cause_analysis: tool({
  description: "Cross-department root-cause chain for margin, cash, delay, or stockout questions.",
  parameters: rootCauseAnalysisSchema,
  execute: async (input) => rootCauseAnalysis(ctx, input),
})
```

Side effect class: `read`.

#### `apps/api/src/services/agent-runner.ts`

No API changes — prompt upgrade is automatic on next message.

### Tests

- `packages/agents/src/tools/root-cause.test.ts` — seeded Arka graph: "margin" returns chain with Material + PO nodes; "delay" on SO-218 finds late brass PO
- `packages/agents/src/governor.test.ts` — mock streamText; verify system prompt contains "Observation" and "Recommendation" sections

### Integration

- Existing tool loop unchanged; new tool available immediately
- `GovernorDock` shows richer assistant text via existing `AgentThread` — no UI changes required

### User experience after Phase 1

- Ask "Why is margin falling?" → agent calls `root_cause_analysis`, returns structured chain: raw material costs ↑ → Supplier X → Product Y exposed → recommends price review or PO from alternate vendor
- Ask "What needs attention?" → agent groups exceptions by domain, proposes specific tool actions (not a flat list)
- Tool traces show cross-module reads before recommendations

---

## Phase 2: Smart Agent Inbox (~30 min)

**Goal:** Transform `ExceptionList` into an **Agent Inbox** with enriched items and actionable buttons.

### Data model extension

#### `packages/graph/src/types.ts`

Extend `Exception` (backward compatible — new fields optional):

```ts
export type InboxAction = {
  id: string;
  label: string;           // "Send reminder", "Draft PO", "Investigate"
  kind: "agent_prompt" | "navigate" | "approval";
  payload: {
    message?: string;      // agent_prompt: pre-filled Governor message
    nodeKey?: string;      // navigate: focus this node
    action?: string;       // approval: proposed action type hint
  };
};

export type Exception = {
  // ... existing fields ...
  why?: string;            // business impact (1 sentence)
  recommendation?: string; // agent recommendation
  actions?: InboxAction[];
  domain?: "finance" | "procurement" | "sales" | "inventory";
  priority?: "critical" | "high" | "medium" | "low";  // maps from severity + code
};
```

#### `packages/graph/src/inbox-enrichment.ts` (NEW)

Pure function: `enrichException(ex: Exception, node: NodeRecord, ctx: EnrichmentContext): Exception`

**Enrichment rules (locked):**

| Code | Domain | Why | Recommendation | Actions |
|------|--------|-----|----------------|---------|
| `invoice.overdue` | finance | "Cash tied up; affects runway" | "Send payment reminder" | `[{label:"Send reminder", kind:"agent_prompt", message:"Create payment link for {key}"}, {label:"View invoice", kind:"navigate"}]` |
| `payment.failure` | finance | "Revenue at risk; stock reserved" | "Retry link or release to next lead" | `[{label:"Fix payment", kind:"agent_prompt", message:"Handle payment failure for {key}"}]` |
| `collections.escalated` | finance | "3 nudges sent — manual follow-up" | "Call customer or escalate" | agent_prompt + navigate |
| `po.late` | procurement | "Material delay blocks production" | "Chase vendor or find alternate" | `[{label:"Draft chase email", kind:"agent_prompt"}, {label:"Find vendors", kind:"agent_prompt"}]` |
| `shipment.delayed` | procurement | "Inbound material late" | "Check alternate suppliers" | agent_prompt |
| `stock.promise_risk` | sales | "Customer promise at risk" | "Expedite PO or adjust promise date" | agent_prompt + navigate |
| `payment.uncollected` | finance | "Link sent but unpaid" | "Follow up or resend" | agent_prompt |

Priority mapping: `risk` + payment/collections → `critical`; other `risk` → `high`; `warn` → `medium`.

#### `packages/graph/src/exceptions.ts`

After `evaluateExceptions()`, call `enrichExceptions(results, nodes)` before return.

Update `GraphStore.exceptions()` in `packages/graph/src/store.ts` to run enrichment.

### Morning briefing

#### `packages/graph/src/briefing.ts` (NEW)

```ts
export type MorningBriefing = {
  greeting: string;          // "Good morning. Your business is mostly on track."
  summary: string;           // "5 things need attention."
  byDomain: Record<string, number>;
  topItems: Exception[];     // top 3 by priority
  generatedAt: string;
};

export function buildMorningBriefing(exceptions: Exception[]): MorningBriefing
```

Logic:
- 0 exceptions → "All clear — no items need attention."
- 1–3 → list each by title
- 4+ → "N things need attention" + domain breakdown

#### `apps/api/src/routes/graph.ts`

Add endpoints:

```ts
GET /v1/inbox          → { exceptions: Exception[], briefing: MorningBriefing }
GET /v1/inbox/briefing → { briefing: MorningBriefing }
```

Keep `GET /v1/exceptions` returning enriched exceptions (backward compatible).

### UI changes

#### `apps/web/src/components/inbox/AgentInboxItem.tsx` (NEW)

Card component:

```
┌─────────────────────────────────────────────┐
│ [CRITICAL] Invoice:INV-104 is overdue       │
│ What: Payment past due, ₹12,400 outstanding │
│ Why: Cash tied up; affects runway           │
│ Recommend: Send payment reminder            │
│ [Send reminder] [View invoice] [Ask Karya]    │
└─────────────────────────────────────────────┘
```

- Color-coded left border: critical=red (`border-l-risk`), high=orange (`border-l-copper`), medium=yellow (`border-l-warn`), low=green (`border-l-teal`)
- Action buttons:
  - `agent_prompt` → call `sendMessage(payload.message)` via `useAgent()`, open `GovernorDock`
  - `navigate` → `focusNode(payload.nodeKey)`
  - `approval` → navigate to approvals (future)

#### `apps/web/src/components/inbox/ExceptionList.tsx`

Rename export to `AgentInbox` (keep `ExceptionList` as re-export alias for tests).

Add:
- Morning briefing banner at top (`BriefingBanner.tsx`)
- Replace `ExceptionRow` with `AgentInboxItem`
- Group by priority (Critical / High / Medium) instead of just Critical/Warnings
- "Ask Karya about this" button on every item → pre-filled prompt with exception context

#### `apps/web/src/components/inbox/BriefingBanner.tsx` (NEW)

Collapsible banner showing `briefing.greeting` + `briefing.summary`. "Show details" expands domain counts.

#### `apps/web/src/lib/api.ts`

Add types: `InboxAction`, `MorningBriefing`, `InboxResponse`. Add `fetchInbox()`.

#### `apps/web/src/components/pages/DashboardPage.tsx`

Replace static alerts list with top 3 enriched inbox items (show `why` + primary action button). Link "View all" → inbox.

#### `apps/web/src/components/Console.tsx`

Wire inbox action handler: pass `onInboxAction` to `InboxView` that opens dock + sends agent message.

### Tests

- `packages/graph/src/inbox-enrichment.test.ts` — each exception code gets why + ≥1 action
- `packages/graph/src/briefing.test.ts` — 0, 3, 10 exceptions
- `apps/web/src/components/inbox/AgentInboxItem.test.tsx` — renders actions, fires callbacks

### User experience after Phase 2

- Open Inbox → morning briefing: "Good morning. 5 things need attention."
- Each item shows What / Why / Recommend with colored priority
- Click "Send reminder" → Governor dock opens, agent starts collections workflow
- Dashboard alerts show actionable cards, not just titles

---

## Phase 3: Agent Memory & Learning (~30 min)

**Goal:** Persist org preferences and learn from human overrides; inject into Governor context.

### MongoDB collection

#### `apps/api/src/services/agent-memory.ts` (NEW)

```ts
export type MemoryKind =
  | "preference"      // "Prefer Supplier A for brass"
  | "decision"        // "Chose Supplier A over B because 17-day delay"
  | "override";       // "Rejected PO draft — too expensive"

export type AgentMemory = {
  _id: string;              // mem_{ulid}
  orgId: string;
  kind: MemoryKind;
  subject: string;          // e.g. "Material:BrassSheet-22g", "po.create"
  content: string;          // human-readable memory text
  source: {
    type: "user" | "approval" | "agent";
    actor: string;
    refId?: string;         // approvalId, thread entry id
  };
  tags: string[];           // ["procurement", "vendor", "brass"]
  createdAt: Date;
  lastUsedAt: Date | null;
  useCount: number;
};
```

Functions:
- `recordMemory(db, orgId, input)` — insert
- `searchMemories(db, orgId, query: { tags?: string[]; subject?: string; limit?: number })` — text match on subject/content/tags
- `recordOverride(db, orgId, approval, note)` — called on rejection with `resolutionNote`
- `memoriesForContext(db, orgId, context: { nodeKey?: string; action?: string })` — top 5 relevant for prompt injection

#### `apps/api/src/mongo.ts`

Add index: `{ orgId: 1, tags: 1 }`, `{ orgId: 1, subject: 1 }`.

### API routes

#### `apps/api/src/routes/agent-memory.ts` (NEW)

```
GET  /v1/agent/memories?tags=procurement&limit=10
POST /v1/agent/memories  { kind, subject, content, tags }
```

Register in `apps/api/src/app.ts`.

### Wire into approval flow

#### `apps/api/src/services/approvals.ts`

In `resolveApproval`, when `status === "rejected"` and `note` present:

```ts
await recordOverride(db, orgId, existing, resolution.note);
```

When `status === "approved"` with edited payload:

```ts
await recordMemory(db, orgId, {
  kind: "decision",
  subject: existing.proposedAction.action,
  content: `Approved ${action} for ${targetNodeKey}`,
  ...
});
```

### Agent integration

#### `packages/agents/src/tools/memory.ts` (NEW)

Tools:
- `memory_search` (read) — search memories by tags/subject
- `memory_record` (draft) — propose a new preference (creates memory on explicit user confirmation via agent)

#### `apps/api/src/services/agent-runner.ts`

Before `runGovernorTurn`:

```ts
const memories = await memoriesForContext(db, orgId, {
  nodeKey: input.contextNodeKey,
});
// pass to buildSystemPrompt as memories: memories.map(m => m.content)
```

Update `buildSystemPrompt` — add section:

```
## Organizational memory
{memories.map(m => `- ${m}`).join('\n')}
Use these when making recommendations. Cite them: "Last time we chose Supplier A because..."
```

### Seed demo memories

#### `packages/seed/src/arka.ts` (modify)

Insert 3–4 memories for Arka Atelier:
- "Prefer Org:Shree-Metal-Works for Material:BrassSheet-22g — verified, 5-day lead"
- "Rejected PO over ₹5L without CFO sign-off (Policy:PO-High-Value)"
- "Customer Org:Rangoli-Retail pays within 15 days when reminded by email"

### Tests

- `apps/api/src/test/agent-memory.test.ts` — CRUD + override recording on reject
- Verify `handleAgentMessage` includes memories in system prompt (mock)

### User experience after Phase 3

- Agent says: "Last time we ordered brass, we chose Shree Metal Works because MetalCo had a 17-day delay"
- Reject a PO approval with note "Too expensive" → future PO recommendations mention cost sensitivity
- Memories visible via API (future UI in Company Settings — out of scope for hackathon)

---

## Phase 4: Event-Driven Proactive Agent (~30 min)

**Goal:** Background loop detects changes, enriches inbox, pushes notifications without user initiating chat.

### Event scanner

#### `apps/api/src/services/agent-events.ts` (NEW)

```ts
export type AgentEvent = {
  _id: string;
  orgId: string;
  type: "exception.new" | "exception.resolved" | "approval.pending";
  exceptionId?: string;
  nodeKey?: string;
  title: string;
  createdAt: Date;
  acknowledged: boolean;
};

export async function scanForEvents(
  db: Db,
  store: GraphStore,
  orgId: string,
  previousSnapshot: ExceptionSnapshot,
): Promise<{ events: AgentEvent[]; snapshot: ExceptionSnapshot }>
```

Logic:
1. Call `store.exceptions(orgId)` → current set
2. Diff against `previousSnapshot` (stored in Mongo `agent_event_state` collection)
3. New exception IDs → create `exception.new` events
4. Removed IDs → create `exception.resolved` events
5. Persist new snapshot

**No LLM in scanner** — pure diff. LLM narration happens when user opens inbox or clicks "Ask Karya".

### Background loop

#### `apps/api/src/services/agent-scheduler.ts` (NEW)

```ts
const SCAN_INTERVAL_MS = 60_000; // 1 minute for demo

export function startAgentScheduler(app: FastifyInstance): void {
  setInterval(async () => {
    for (const orgId of activeOrgs) {
      await scanForEvents(db, store, orgId, ...);
    }
  }, SCAN_INTERVAL_MS);
}
```

Wire in `apps/api/src/index.ts` after server listen. Guard with env `AGENT_EVENTS_ENABLED=true` (default true in dev).

For hackathon: single org `Org:Arka-Atelier` hardcoded is fine.

### API endpoints

#### `apps/api/src/routes/agent-events.ts` (NEW)

```
GET  /v1/agent/events         → { events: AgentEvent[], unacknowledgedCount }
POST /v1/agent/events/ack     → { acknowledged: number }  // mark all read
```

### UI integration

#### `apps/web/src/lib/console-context.tsx`

Add polling (every 60s):

```ts
useEffect(() => {
  const id = setInterval(() => refreshExceptions(), 60_000);
  return () => clearInterval(id);
}, []);
```

On new events: update `exceptionCount` in bootstrap, optionally toast notification.

#### `apps/web/src/components/shell/TopBar.tsx`

Notification bell shows `unacknowledgedCount` from events API (fallback to exception count).

#### `apps/web/src/components/shell/GovernorDock.tsx`

When `unacknowledgedCount > 0` and dock collapsed, show pulse dot + tooltip: "Karya found N new items".

Add suggested prompt: "What changed since I last checked?"

### Proactive agent message (optional stretch within phase)

#### `apps/api/src/services/agent-events.ts`

When `exception.new` count ≥ 1 and no proactive message in last 4 hours:

- Append a system-style assistant entry to thread (or store in `agent_notifications` collection)
- Message: "I detected {title}. {recommendation}. Want me to {primary action}?"

Don't auto-run tools — push only.

### Tests

- `apps/api/src/test/agent-events.test.ts` — seed graph, add overdue invoice, scan detects new event
- Diff resolves when exception cleared

### User experience after Phase 4

- Leave app open → notification badge increments when payment fails (via webhook) or invoice goes overdue
- Inbox auto-refreshes; new items appear with "just now"
- Collapsed dock pulses: "Karya found 2 new items"
- Demo narrative: "The agent watches your business while you sleep"

---

## Phase 5: Dynamic Reports & Dashboards (~30 min)

**Goal:** Agent generates ad-hoc reports from graph data; dashboard shows agent-curated KPIs.

### Report generator tool

#### `packages/agents/src/tools/report.ts` (NEW)

```ts
export type ReportSpec = {
  title: string;
  generatedAt: string;
  sections: Array<{
    heading: string;
    kind: "markdown" | "table" | "metric";
    content: string | { columns: string[]; rows: string[][] } | { label: string; value: string; trend?: string };
  }>;
};

export type ReportTemplate =
  | "cash_flow_forecast"
  | "collections_priority"
  | "inventory_health"
  | "sales_pipeline"
  | "vendor_performance"
  | "custom";
```

**Template implementations (deterministic, no LLM inside):**

| Template | Data sources | Output |
|----------|--------------|--------|
| `cash_flow_forecast` | Ledger entries + overdue invoices + open POs | 30-day in/out table, net position |
| `collections_priority` | Overdue invoices sorted by amount × age | Ranked table with recommended action |
| `inventory_health` | Stock nodes + promise risks | SKUs below reorder, days-to-stockout estimate |
| `sales_pipeline` | Open SOs by status + promise dates | Funnel counts + at-risk orders |
| `vendor_performance` | PO nodes + shipment delays | Vendor scorecard (on-time %, avg delay) |

```ts
export async function generateReport(ctx: ToolContext, input: {
  template: ReportTemplate;
  params?: Record<string, string>;
  explanation: string;
}): Promise<ReportSpec>
```

Register as `generate_report` tool (read class).

### Report rendering in chat

#### `apps/web/src/components/agent/ReportBlock.tsx` (NEW)

Renders `ReportSpec`:
- Metric sections → KPI cards (reuse `KpiCard` styling)
- Table sections → compact `DataTable`
- Markdown sections → `<pre>` with monospace or simple markdown parser

Detect report in tool output: if `entry.output?.sections`, render `ReportBlock` in `ToolTrace` or inline after assistant message.

#### `packages/agents/src/system-prompt.ts`

Add: "For report requests ('cash flow forecast', 'monthly summary'), use `generate_report` and present findings with one unusual-item callout."

### Agent-curated dashboard KPIs

#### `apps/api/src/routes/dashboard.ts` (NEW)

```
GET /v1/dashboard/agent-kpis → {
  kpis: Array<{ label, value, trend?, why, nodeKey? }>,
  generatedAt: string
}
```

Logic (deterministic):
1. Compute receivables, cash, pending orders (existing)
2. Add **agent annotations**: if overdue > 3 → KPI "Collections Risk" red; if promise_risk > 0 → "At-Risk Promises"
3. Each KPI includes `why` string

#### `apps/web/src/components/pages/DashboardPage.tsx`

- Fetch `/v1/dashboard/agent-kpis` alongside existing data
- Replace hardcoded trend percentages ("12%", "5%") with real computed trends or remove if no data
- Add `why` tooltip on KPI hover (reuse `Tooltip` component)
- Add "Generate report" button → opens Governor with "Prepare my weekly management report"

### Tests

- `packages/agents/src/tools/report.test.ts` — each template returns valid ReportSpec against seed
- `apps/api/src/test/dashboard.test.ts` — agent-kpis returns ≥4 KPIs

### User experience after Phase 5

- "Give me a cash flow forecast" → structured table in chat with 30-day projection
- "Prepare the monthly management report" → multi-section report with unusual-item callout
- Dashboard KPIs show agent `why` on hover: "Receivables up because INV-104, INV-107 overdue"

---

## Phase 6: Authority Level Configuration (~30 min)

**Goal:** UI for configuring agent autonomy per action type; agent checks authority before acting.

### Authority model

Extend existing policy system — **do not create parallel config**.

#### `packages/policy/src/actions.ts`

Already has `POLICY_ACTIONS`. Document mapping:

| User-facing label | Policy action | Default autonomy |
|-------------------|---------------|------------------|
| Read data | (no policy) | Auto |
| Draft email | `email.send` with draft flag | Auto draft, approve send |
| Send email | `email.send` | Require approval |
| Create PO < ₹50k | `po.create` | Allow (auto) |
| Create PO > ₹5L | `po.create` | Require approval |
| Payment link | `collect.invoice` | Require approval |
| Vendor payout | `pay.vendor` | Require approval |
| Publish listing | `listing.publish` | Require approval |

### Seed policies

#### `packages/seed/src/arka-policies.ts` (NEW or extend existing)

Ensure graph contains Policy nodes:

```json
{
  "key": "Policy:PO-Auto-Under-50k",
  "rules_json": {
    "action": "po.create",
    "rules": [{ "field": "amountInPaise", "op": "lte", "value": 5000000 }],
    "effect": "allow"
  }
},
{
  "key": "Policy:PO-Approve-Over-5L",
  "rules_json": {
    "action": "po.create",
    "rules": [{ "field": "amountInPaise", "op": "gte", "value": 50000000 }],
    "effect": "require_approval"
  }
}
```

### Authority UI

#### `apps/web/src/components/policy/AuthoritySettings.tsx` (NEW)

Table UI on Policies page (tab alongside existing PolicyStudio):

| Action | Auto | Draft only | Require approval | Deny |
|--------|------|------------|------------------|------|
| Create PO | ○ under ₹50k | — | ○ over ₹5L | ○ |
| Send email | — | ○ | ● default | ○ |
| Payment link | — | — | ● default | ○ |
| ... | | | | |

Implementation: each row maps to Policy node(s). Changing radio → update `rules_json` effect via existing policy API or new:

```
PUT /v1/policies/:key/autonomy  { effect: "allow" | "require_approval" | "deny", threshold?: number }
```

#### `apps/api/src/routes/policies.ts` (modify)

Add autonomy update endpoint that rewrites policy rules safely.

### Agent behavior

#### `packages/agents/src/system-prompt.ts`

Add authority awareness:

```
Before write/money tools, state whether action will auto-execute or need approval based on policy.
If auto-allowed by policy (e.g. PO under ₹50k), execute immediately and report result.
If require_approval, draft and tell operator an Approval card is waiting.
```

No code change in tool executors — existing `evaluateAction` path already handles this. Prompt ensures agent **communicates** autonomy clearly.

### Tests

- Policy evaluation: PO at ₹40k → allow; PO at ₹6L → require_approval
- UI toggles update policy node

### User experience after Phase 6

- Settings → Policies → Authority tab: "Auto-approve POs under ₹50k" toggle
- Agent: "This PO is ₹42k — within auto-approve threshold. Creating now."
- Agent: "This PO is ₹6.2L — needs your approval. Card is waiting."

---

## 4. Architectural Decisions & Trade-offs

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Single vs multi-agent | **Keep single Governor** | Existing architecture, lower cost, simpler demo. Domain "agents" are prompt lenses + tool groupings. |
| Inbox enrichment | **Deterministic rules**, not LLM per item | Predictable for demo/tests; fast; LLM narrates on demand via action buttons. |
| Event loop | **In-process `setInterval`** in API | No separate worker service for hackathon; good enough for single-org demo. Production → BullMQ/cron. |
| Memory storage | **MongoDB collection**, not graph nodes | Memories are meta; don't pollute operational graph. Tags enable retrieval. |
| Root-cause analysis | **Graph walks + templates**, not free-form LLM | Deterministic chains are testable and reliable; Governor adds natural language wrapper. |
| Reports | **Template-based generation** | Consistent output for demo; extensible via new templates. |
| Authority config | **Extend Policy nodes** | Reuses evaluation path; no duplicate permission system. |
| Backward compatibility | **Optional fields on Exception** | Old clients ignore `why`/`actions`; `/v1/exceptions` keeps working. |

### Risks & mitigations

| Risk | Mitigation |
|------|------------|
| LLM ignores new prompt structure | Add 2–3 few-shot examples in system prompt; test with golden prompts |
| Background scanner noise | Diff-based events only; ack flow; 60s interval not 5s |
| Memory retrieval irrelevant | Tag-based search + subject match; cap at 5 memories in prompt |
| Phase scope creep | Each phase has explicit "out of scope" — no email sending UI, no multi-org scheduler |

---

## 5. File Summary (all phases)

### New files

```
packages/graph/src/inbox-enrichment.ts
packages/graph/src/inbox-enrichment.test.ts
packages/graph/src/briefing.ts
packages/graph/src/briefing.test.ts
packages/agents/src/tools/root-cause.ts
packages/agents/src/tools/root-cause.test.ts
packages/agents/src/tools/memory.ts
packages/agents/src/tools/report.ts
packages/agents/src/tools/report.test.ts
apps/api/src/services/agent-memory.ts
apps/api/src/services/agent-events.ts
apps/api/src/services/agent-scheduler.ts
apps/api/src/routes/agent-memory.ts
apps/api/src/routes/agent-events.ts
apps/api/src/routes/dashboard.ts
apps/api/src/test/agent-memory.test.ts
apps/api/src/test/agent-events.test.ts
apps/api/src/test/dashboard.test.ts
apps/web/src/components/inbox/AgentInboxItem.tsx
apps/web/src/components/inbox/AgentInboxItem.test.tsx
apps/web/src/components/inbox/BriefingBanner.tsx
apps/web/src/components/agent/ReportBlock.tsx
apps/web/src/components/policy/AuthoritySettings.tsx
packages/seed/src/arka-policies.ts (or extend arka.ts)
```

### Modified files

```
packages/graph/src/types.ts
packages/graph/src/exceptions.ts
packages/graph/src/store.ts
packages/agents/src/system-prompt.ts
packages/agents/src/governor.ts
packages/agents/src/tools/index.ts
packages/agents/src/tools/schemas.ts
apps/api/src/services/agent-runner.ts
apps/api/src/services/approvals.ts
apps/api/src/routes/graph.ts
apps/api/src/routes/policies.ts
apps/api/src/mongo.ts
apps/api/src/app.ts
apps/api/src/index.ts
apps/web/src/components/inbox/ExceptionList.tsx
apps/web/src/components/pages/DashboardPage.tsx
apps/web/src/components/Console.tsx
apps/web/src/components/shell/GovernorDock.tsx
apps/web/src/components/shell/TopBar.tsx
apps/web/src/components/policy/PolicyStudio.tsx
apps/web/src/lib/api.ts
apps/web/src/lib/console-context.tsx
packages/seed/src/arka.ts
```

---

## 6. Demo Script (post Phase 2+4)

1. **Open app** → Dashboard shows briefing: "Good morning. 5 things need attention."
2. **Click Inbox** → enriched items with Why + "Send reminder" button
3. **Click "Send reminder"** on overdue invoice → Governor drafts payment link
4. **Ask:** "Why is margin falling?" → root-cause chain across procurement + sales
5. **Ask:** "Give me a cash flow forecast" → structured report in chat (Phase 5)
6. **Reject a PO** with note → later agent cites preference (Phase 3)
7. **Show Policies → Authority** → "Auto-approve POs under ₹50k" (Phase 6)

---

## 7. Out of Scope (hackathon)

- Separate LLM instances per Finance/Procurement/Sales agent
- Real email/Slack push notifications (in-app only)
- ML-based anomaly detection or forecasting models
- Multi-tenant event scheduler
- Agent-generated custom dashboard layouts (drag-drop)
- Browser-based vendor negotiation (Level 4 autonomy)
- Full "Learn" loop with embedding-based memory retrieval

---

## 8. Verification Checklist

After all phases:

- [ ] `pnpm test` passes (new tests for enrichment, root-cause, memory, events, reports)
- [ ] Inbox shows What/Why/Recommend/Actions for all 7 exception codes
- [ ] Morning briefing renders with 0 and N exceptions
- [ ] Governor prompt includes reasoning protocol
- [ ] "Why is margin falling?" returns cross-department chain
- [ ] Inbox action button triggers Governor workflow
- [ ] Background scan detects new exception within 60s
- [ ] Rejected approval creates override memory
- [ ] `generate_report` returns cash flow forecast
- [ ] Authority UI toggles policy effect
- [ ] No regression: existing approval flow, payment links, seed data
