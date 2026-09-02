# Karya Multi-Agent System Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans or superpowers:subagent-driven-development to implement phase-by-phase. Each phase is independently deployable (~30 min per agent). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Evolve Karya from a single Governor with domain “lenses” into a **true multi-agent collaboration** system — specialized department agents with distinct prompts, tool subsets, and personalities that the Governor consults (in parallel when needed), with collaboration visible in the chat UI and optional direct-to-specialist persona mode.

**Architecture stance:** One OpenAI API key / model; **each agent persona is a separate `streamText` / `generateText` call** with its own system prompt and filtered tools. No separate processes or worker pools. The Governor remains the default orchestrator; specialists are invoked via `consultAgent()` (Governor tool) or selected directly in the UI. Operational truth stays in `@karya/graph`; thread state stays in MongoDB `agent_threads`.

**Relationship to prior plan:** This **supersedes** the “single Governor, domain lenses only” stance in `2026-08-28-agentic-erp-enhancement.md` §4 for collaboration demos. It **builds on** Phase 1 enhancements already landed (reasoning protocol, `root_cause_analysis`, `generate_report`, memory injection).

**Tech Stack (unchanged):** TypeScript 5.8, Fastify 5, Next.js, MongoDB, Vercel AI SDK `ai` ^4, `@karya/agents`, Vitest.

---

## 1. Current State (baseline)

| Component | Today | Limitation |
|-----------|-------|------------|
| `packages/agents/src/governor.ts` | Single `runGovernorTurn` → `streamText` with all tools | No delegation; one LLM loop |
| `packages/agents/src/system-prompt.ts` | “Domain lenses (not separate agents)” | Role-play discouraged |
| `packages/agents/src/tools/index.ts` | `buildTools(ctx)` returns 30+ tools | No partitioning |
| `apps/api/src/services/agent-runner.ts` | Always calls `runGovernorTurn` | No `agentId` routing |
| `apps/web/.../GovernorDock.tsx` | Single “Karya AI” header | No persona selector |
| `ThreadEntry` (`types.ts`) | `user` \| `assistant` \| `tool` | No consult / agent attribution |

**Preserve:** approval flow, tool tracing (`onToolStart` / `onToolFinish`), SSE streaming, existing thread CRUD, policy gates on money/write tools.

---

## 2. Target Architecture

```
User message
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  API: handleAgentMessage({ message, agentId? })         │
│    agentId === "governor" (default) → runGovernorTurn   │
│    agentId === "finance" | ...        → runSpecialistTurn│
└─────────────────────────────────────────────────────────┘
    │
    ▼ (Governor path)
┌─────────────────────────────────────────────────────────┐
│  Governor LLM (orchestrator prompt + meta-tools)        │
│    consult_agents([{ agentId, question }, ...])         │
│         │ parallel Promise.all                          │
│         ├──► Finance LLM + finance tools                │
│         ├──► Sales LLM + sales tools                    │
│         └──► Procurement LLM + procurement tools        │
│    synthesizes unified assistant reply                  │
└─────────────────────────────────────────────────────────┘
    │
    ▼
Thread entries (persisted, streamed via SSE):
  user → consult (×N, running→done) → tool (×M, tagged agentId) → assistant (governor)
```

### Agent roster (locked)

| ID | Display name | Icon | Primary concerns |
|----|--------------|------|------------------|
| `governor` | Governor | 🎯 | Orchestration, synthesis, cross-domain decisions |
| `finance` | Finance Agent | 💰 | Overdue invoices, collections, ledger, cash flow, payment failures |
| `procurement` | Procurement Agent | 📦 | Stock/reorder, POs, vendors, material costs |
| `sales` | Sales Agent | 📈 | Pipeline, fulfillment promises, quotes, listings, revenue |
| `operations` | Operations Agent | ⚙️ | Work orders, BOMs, calendar, cross-dept coordination |

### Collaboration example (demo script)

**User:** “Can we give Customer X a 10% discount?”

**Thread UI:**
1. `consult` entry — Finance Agent — running → done (findings: margin impact −4.2 pp)
2. Nested `tool` rows — `money_get_ledger`, `sales_generate_quote` (tagged `finance` / `sales`)
3. `consult` entry — Sales Agent — done (LTV, strategic account)
4. `consult` entry — Procurement Agent — done (cost basis on SKUs)
5. `assistant` entry — Governor — “Recommend 7% instead of 10%…”

---

## 3. Implementation Phases Overview

| Phase | Title | Est. | User-visible outcome |
|-------|-------|------|----------------------|
| **A** | Agent Registry + Specialist Agents | ~30 min | Governor consults Finance/Sales/Procurement in parallel; findings returned; backward-compatible default chat |
| **B** | UI + Collaboration Visualization | ~30 min | Agent selector in dock; “Consulting Finance Agent…” traces; persona badges on replies |

---

## Phase A: Agent Registry + Specialist Agents (~30 min)

**Goal:** Introduce agent registry, specialist prompts, tool partitioning, `consultAgent()` / `runSpecialistTurn()`, and Governor delegation via a `consult_agents` meta-tool — without breaking existing single-agent chat.

### A.1 Types & registry

#### `packages/agents/src/types.ts` (modify)

Add:

```ts
export type AgentId =
  | "governor"
  | "finance"
  | "procurement"
  | "sales"
  | "operations";

export type AgentDefinition = {
  id: AgentId;
  displayName: string;
  shortName: string;       // "Finance", "Procurement", …
  icon: string;            // emoji for UI
  description: string;     // one-line for selector tooltip
  toolNames: readonly string[];  // subset of TOOL_SIDE_EFFECTS keys
  canConsult: boolean;     // false for governor
  canDirectChat: boolean;  // true for all including governor
};

export type ConsultFinding = {
  agentId: AgentId;
  question: string;
  findings: string;
  toolEntryIds: string[];  // child tool traces spawned during consult
  status: "running" | "done" | "error";
  error?: string;
  completedAt?: string;
};
```

Extend `ThreadEntry` union — **backward compatible** (new kinds optional in old threads):

```ts
| {
    id: string;
    kind: "consult";
    agentId: AgentId;
    question: string;
    findings: string | null;
    status: ToolTraceStatus;  // running | done | error
    toolEntryIds: string[];
    error: string | null;
    createdAt: string;
    completedAt: string | null;
  }
```

Extend existing variants:

```ts
// assistant — add optional agentId (default governor in UI when absent)
{ kind: "assistant"; content: string; agentId?: AgentId; createdAt: string }

// tool — add optional agentId when invoked by specialist consult
{ kind: "tool"; ...; agentId?: AgentId; consultEntryId?: string }
```

Extend `AgentThread`:

```ts
activeAgentId?: AgentId;  // last selected persona for thread (UI default)
```

#### `packages/agents/src/registry.ts` (NEW)

Single source of truth for agents and tool partitions.

```ts
import { TOOL_SIDE_EFFECTS } from "./tools/index.js";
import type { AgentDefinition, AgentId } from "./types.js";

/** Shared read tools every specialist gets */
export const SHARED_READ_TOOLS = [
  "query_graph",
  "list_all_data",
  "graph_get_neighborhood",
  "graph_find_path",
  "graph_get_impact",
  "graph_list_exceptions",
  "memory_search",
] as const;

export const AGENT_DEFINITIONS: Record<AgentId, AgentDefinition> = {
  governor: { /* all tools + consult_agents */ },
  finance: { toolNames: [...SHARED_READ_TOOLS, "money_*", ...] },
  procurement: { ... },
  sales: { ... },
  operations: { ... },
};

export function toolNamesForAgent(id: AgentId): string[];
export function getAgentDefinition(id: AgentId): AgentDefinition;
export function listConsultableAgents(): AgentDefinition[];
```

**Tool partitions (locked — reuse existing tool names only):**

| Agent | Tools (in addition to `SHARED_READ_TOOLS`) |
|-------|---------------------------------------------|
| **finance** | `money_create_payment_link`, `money_list_overdue_invoices`, `money_propose_collection`, `money_run_collections_loop`, `money_classify_failure`, `money_impact_query`, `money_propose_recovery`, `money_propose_payout`, `money_get_ledger`, `generate_report` (templates: cash_flow_forecast, collections_priority), `root_cause_analysis`, `memory_record` |
| **procurement** | `inventory_check_stock`, `inventory_promise_query`, `sourcing_explain_need`, `sourcing_search_vendors`, `sourcing_browse_public`, `sourcing_draft_po`, `comms_draft_email`, `generate_report` (inventory_health, vendor_performance), `memory_record` |
| **sales** | `sales_get_order_book`, `sales_generate_quote`, `sales_accept_order`, `sales_reject_order`, `inventory_promise_query`, `listings_draft_copy`, `comms_draft_email`, `generate_report` (sales_pipeline), `memory_record` |
| **operations** | `inventory_check_stock`, `inventory_promise_query`, `calendar_meeting_brief`, `root_cause_analysis`, `generate_report` (all templates), `comms_draft_email`, `memory_record` |
| **governor** | **All tools** in `TOOL_SIDE_EFFECTS` **plus** `consult_agents` |

Implementation note: expand `money_*` literally in the array; validate at module load that every name exists in `TOOL_SIDE_EFFECTS`.

#### `packages/agents/src/tools/partition.ts` (NEW)

```ts
export function buildToolsForAgent(
  ctx: ToolContext,
  agentId: AgentId,
): Record<string, CoreTool> {
  const all = buildTools(ctx);
  const names = new Set(toolNamesForAgent(agentId));
  return Object.fromEntries(
    Object.entries(all).filter(([name]) => names.has(name)),
  );
}
```

Export from `packages/agents/src/tools/index.ts`.

---

### A.2 Specialist system prompts

#### `packages/agents/src/prompts/base.ts` (NEW)

Shared context builder used by all personas:

```ts
export function buildAgentContextBlock(ctx: {
  orgLabel: string;
  contextNodeKey: string | null;
  exceptionCount: number;
  memories?: string[];
  briefingSummary?: string;
}): string
```

Returns org label, selected node, exception count, memories, briefing — **without** persona-specific instructions.

#### `packages/agents/src/prompts/finance.ts` (NEW)

```ts
export function buildFinancePrompt(ctx: PromptContext): string
```

**Locked personality & priorities:**
- Identity: “You are the Finance Agent for {orgLabel}. You own cash, receivables, payables, and margin impact.”
- Priorities: (1) overdue / collections, (2) payment failures, (3) cash runway, (4) month-end close tasks
- Output format for consult responses (structured, ≤200 words):
  - **Finding:** one sentence
  - **Evidence:** node keys + ₹ amounts
  - **Risk:** low | medium | high
  - **Recommendation:** specific next action
- Rules: never execute `money_create_payment_link` during a consult unless explicitly asked to draft; cite ledger data; use `generate_report` for forecasts

Mirror structure for:

#### `packages/agents/src/prompts/procurement.ts` (NEW)
- Priorities: stockouts, reorder points, late POs, vendor scorecards, material cost
- Emphasize `sourcing_search_vendors` before `sourcing_draft_po`

#### `packages/agents/src/prompts/sales.ts` (NEW)
- Priorities: pipeline, promise risk, stale orders, customer LTV, listings
- Emphasize `inventory_promise_query` before accepting orders

#### `packages/agents/src/prompts/operations.ts` (NEW)
- Priorities: work orders (via graph query on Task/WorkOrder nodes), BOM availability, calendar, cross-team blockers
- Emphasize `calendar_meeting_brief`, `root_cause_analysis` for delays

#### `packages/agents/src/prompts/governor.ts` (NEW)

Refactor orchestrator prompt out of `system-prompt.ts`:

```ts
export function buildGovernorPrompt(ctx: PromptContext): string
```

**Replace** “Domain lenses (not separate agents)” with:

```
## Multi-agent orchestration (MANDATORY for cross-domain questions)
You lead a team of specialist agents. You have the `consult_agents` tool.

When a question spans 2+ domains (margin/discount/pricing, cash+inventory, delay root cause, customer terms):
1. Call `consult_agents` with parallel requests — one per relevant specialist.
2. Wait for findings before recommending.
3. Synthesize a unified answer: Observation → Why it matters → Recommendation → What I'll do.
4. Attribute insights: "Finance flagged…", "Sales noted…".

When a question is single-domain, you MAY answer directly OR consult one specialist for depth.

Never role-play specialists in prose without calling `consult_agents` first.
```

Keep existing Reasoning Protocol, Authority & Autonomy, tool catalog appendix (condensed).

#### `packages/agents/src/system-prompt.ts` (modify)

Thin re-export for backward compatibility:

```ts
export function buildSystemPrompt(ctx): string {
  return buildGovernorPrompt(ctx);
}
```

Add `buildPromptForAgent(agentId: AgentId, ctx): string` dispatcher.

---

### A.3 consultAgent + specialist turn runner

#### `packages/agents/src/consult.ts` (NEW)

Core consultation engine — **separate LLM call per specialist**.

```ts
export type ConsultDeps = {
  model: string;
  apiKey: string;
  orgId: string;
  orgLabel: string;
  contextNodeKey: string | null;
  exceptionCount: number;
  memories?: string[];
  tools: Record<string, CoreTool>;  // pre-filtered for target agent
  onConsultStart: (entry: ThreadEntry) => Promise<void>;
  onConsultFinish: (entryId: string, update: Partial<ConsultEntry>) => Promise<void>;
  onToolStart: (entry: ThreadEntry) => Promise<void>;
  onToolFinish: (entryId: string, update: Partial<ToolEntry>) => Promise<void>;
  consultEntryId: string;  // parent consult row id
};

export async function consultAgent(
  agentId: AgentId,
  question: string,
  deps: ConsultDeps,
): Promise<ConsultFinding>
```

**Implementation steps:**
1. Create `consult` thread entry (`status: "running"`), `onConsultStart`.
2. `buildPromptForAgent(agentId, ctx)`.
3. `generateText` (prefer over stream for sub-calls — shorter, deterministic completion) with:
   - `model: openai(deps.model)`
   - `tools: wrapToolsForTracing(..., { agentId, consultEntryId })`
   - `maxSteps: 8`
4. Collect `toolEntryIds` from traced tools.
5. Update consult entry: `findings`, `status: "done"`, `toolEntryIds`, `onConsultFinish`.
6. Return `ConsultFinding`.

On error: set `status: "error"`, return partial findings string.

**Parallel batch:**

```ts
export async function consultAgentsParallel(
  requests: Array<{ agentId: AgentId; question: string }>,
  deps: Omit<ConsultDeps, "consultEntryId"> & {
    onBatchStart: (entries: ThreadEntry[]) => Promise<void>;
  },
): Promise<ConsultFinding[]>
```

Uses `Promise.all` — each request gets its own `consultEntryId`.

#### `packages/agents/src/specialist.ts` (NEW)

Direct persona chat (no Governor):

```ts
export type SpecialistDeps = GovernorDeps & { agentId: AgentId };

export async function runSpecialistTurn(
  deps: SpecialistDeps,
  userMessage: string,
): Promise<GovernorTurnResult>
```

Same shape as `runGovernorTurn` but:
- `buildPromptForAgent(deps.agentId, ...)`
- `buildToolsForAgent(ctx, deps.agentId)`
- Assistant entry includes `agentId: deps.agentId`
- Reuse `wrapToolsForTracing` with `agentId` set on tool entries

#### `packages/agents/src/governor.ts` (modify)

1. Extract `wrapToolsForTracing` to `packages/agents/src/tracing.ts` (shared by governor + consult).
2. Add optional fields to `GovernorDeps`:
   - `consultAgents?: (requests) => Promise<ConsultFinding[]>`
3. Register `consult_agents` tool inside `runGovernorTurn` when `deps.consultAgents` provided:

```ts
consult_agents: tool({
  description:
    "Consult one or more specialist agents in parallel. Use for cross-domain analysis before recommending.",
  parameters: consultAgentsSchema, // z.array({ agentId, question })
  execute: async (input) => {
    const findings = await deps.consultAgents!(input.requests);
    return { findings };  // structured for Governor synthesis
  },
}),
```

4. `consult_agents` trace uses `sideEffectClass: "read"`, `toolName: "consult_agents"`.

#### `packages/agents/src/tools/schemas.ts` (modify)

```ts
export const consultAgentsSchema = z.object({
  requests: z.array(z.object({
    agentId: z.enum(["finance", "procurement", "sales", "operations"]),
    question: z.string().min(8),
  })).min(1).max(4),
  explanation: explanationField,
});
```

Add to `TOOL_SIDE_EFFECTS`: `consult_agents: "read"`.

---

### A.4 API wiring

#### `apps/api/src/services/agent-runner.ts` (modify)

1. Import `runSpecialistTurn`, `consultAgentsParallel`, `buildToolsForAgent`, `buildToolContext` stays.

2. Extend `handleAgentMessage` input:

```ts
input: {
  message: string;
  contextNodeKey?: string;
  actor: string;
  agentId?: AgentId;  // default "governor"
}
```

3. Branch:

```ts
const agentId = input.agentId ?? "governor";

if (agentId !== "governor") {
  return runSpecialistTurn({ ...deps, agentId, tools: buildToolsForAgent(ctx, agentId) }, message);
}

return runGovernorTurn({
  ...deps,
  tools: buildTools(ctx), // includes consult_agents wrapper
  consultAgents: async (requests) =>
    consultAgentsParallel(requests, {
      ...consultDeps,
      onBatchStart: async (entries) => { for (const e of entries) await appendEntry(...); },
    }),
});
```

4. Update `buildToolContext` audit actor: `agent:${agentId}` instead of hardcoded `agent:governor`.

5. Persist `activeAgentId` on thread when message received (optional `$set` on thread doc).

#### `apps/api/src/routes/agent.ts` (modify)

Extend body schema:

```ts
const messageBodySchema = z.object({
  message: z.string().min(1),
  contextNodeKey: z.string().optional(),
  agentId: z.enum(["governor", "finance", "procurement", "sales", "operations"]).optional(),
});
```

Add metadata endpoint:

```ts
GET /v1/agent/personas → { personas: AgentDefinition[] }
```

Returns `listConsultableAgents()` + governor entry for UI selector.

#### `apps/api/src/services/agent-thread.ts`

No schema migration required — Mongo stores extended entries as-is. Optionally add `activeAgentId` field to `AgentThread` type.

---

### A.5 Package exports

#### `packages/agents/src/index.ts` (modify)

Export:
- `AgentId`, `AgentDefinition`, `ConsultFinding`
- `AGENT_DEFINITIONS`, `listConsultableAgents`, `toolNamesForAgent`
- `buildToolsForAgent`, `buildPromptForAgent`
- `consultAgent`, `consultAgentsParallel`
- `runSpecialistTurn`

---

### A.6 Tests (Phase A)

#### `packages/agents/src/registry.test.ts` (NEW)
- Every partitioned tool name exists in `TOOL_SIDE_EFFECTS`
- No overlap gaps for governor (union of all === all tools + consult_agents)
- Shared read tools included for all specialists

#### `packages/agents/src/consult.test.ts` (NEW)
- Mock `generateText`; verify finance consult calls only finance tools
- Parallel consult invokes 3 mocks concurrently (`Promise.all` timing)

#### `packages/agents/src/specialist.test.ts` (NEW)
- `runSpecialistTurn` uses finance prompt string fragment

#### `apps/api/src/test/agent.test.ts` (modify)
- POST with `agentId: "finance"` returns assistant entry with `agentId: "finance"`
- POST without `agentId` — unchanged behavior (no consult entries unless message triggers)

---

### A.7 Integration & backward compatibility

| Concern | Mitigation |
|---------|------------|
| Old threads without `consult` entries | UI treats unknown kinds as skip or generic tool row |
| Single-domain chat | Governor works without calling `consult_agents` — no forced delegation |
| Approval flow | Specialist money tools still return `awaiting_approval`; pending on thread unchanged |
| Cost | Consult only when Governor invokes tool or user picks specialist; cap `max 4` parallel |
| CI without OpenAI | Mock `generateText` in consult tests; existing agent.test mocks stream |

---

### A.8 User experience after Phase A

- **Default chat unchanged** for “Check exceptions” / “Review stock” — Governor may answer solo.
- **Cross-domain ask** (“10% discount for Customer X”) → Governor calls `consult_agents` → multiple consult entries persisted → synthesized recommendation.
- **Direct mode (API only until Phase B):** `POST /v1/agent/message { agentId: "finance", message: "..." }` → Finance persona responds with finance tools only.
- **Tool traces** show specialist tool calls with `agentId` in data (UI renders fully in Phase B).

---

## Phase B: UI + Collaboration Visualization (~30 min)

**Goal:** Agent persona selector in `GovernorDock`, rich consult trace rendering, persona badges on assistant bubbles, and SSE/API plumbing for `agentId`.

### B.1 API client types

#### `apps/web/src/lib/api.ts` (modify)

```ts
export type AgentId =
  | "governor"
  | "finance"
  | "procurement"
  | "sales"
  | "operations";

export type AgentPersonaDto = {
  id: AgentId;
  displayName: string;
  shortName: string;
  icon: string;
  description: string;
};

// Extend AgentThreadEntryDto with consult kind + optional agentId (mirror packages/agents types)

export async function fetchAgentPersonas(): Promise<AgentPersonaDto[]>;

export async function sendAgentMessage(
  message: string,
  options?: {
    contextNodeKey?: string;
    agentId?: AgentId;
    onEvent?: (ev: AgentStreamEvent) => void;
  },
): Promise<AgentThreadDto>;
```

Keep backward-compatible overload: existing callers passing `(message, contextNodeKey, onEvent)` still work.

---

### B.2 Agent context state

#### `apps/web/src/lib/agent-context.tsx` (modify)

Add state:

```ts
selectedAgentId: AgentId;  // default "governor"
personas: AgentPersonaDto[];
setSelectedAgent: (id: AgentId) => void;
```

On mount: `fetchAgentPersonas()` → set personas.

Update `sendMessage`:

```ts
await sendAgentMessage(message, {
  contextNodeKey: selectedNodeKey ?? undefined,
  agentId: selectedAgentId,
  onEvent,
});
```

When `selectedAgentId !== "governor"`, header subtitle reflects active persona (Phase B UI).

Optional: persist `selectedAgentId` in `sessionStorage` key `karya-agent-persona`.

---

### B.3 Agent selector component

#### `apps/web/src/components/agent/AgentSelector.tsx` (NEW)

Compact persona picker for dock header:

```
┌──────────────────────────────────────────────┐
│ [🎯 Governor ▾]  Karya AI                    │
└──────────────────────────────────────────────┘
         ┌─────────────────────┐
         │ 🎯 Governor         │ ← default
         │ 💰 Finance Agent    │
         │ 📦 Procurement Agent│
         │ 📈 Sales Agent      │
         │ ⚙️ Operations Agent │
         └─────────────────────┘
```

**Specs:**
- Props: `personas`, `selected`, `onSelect`, `disabled` (while sending)
- Dropdown: click / keyboard accessible (`aria-haspopup="listbox"`)
- Selected item shows icon + shortName
- Tooltip on hover: `description`
- Styling: match existing dock tokens (`bg-surface-2`, `border-line/40`, `text-[11px]`)

#### `apps/web/src/components/agent/AgentPersonaBadge.tsx` (NEW)

Small inline badge for assistant bubbles:

```tsx
<AgentPersonaBadge agentId="finance" />  // "💰 Finance"
```

Governor omits badge (or shows subtle “Governor” only when synthesizing after consult block).

---

### B.4 Consult trace rendering

#### `apps/web/src/components/agent/ConsultTraceRow.tsx` (NEW)

Renders `kind: "consult"` entries:

```
┌─ ConsultTraceRow ─────────────────────────────┐
│ 💰 Consulting Finance Agent          [done]  │
│ ▼ "What's the margin impact of 10% discount…" │
│   Finding: −4.2 pp margin; INV-90 at risk…    │
│   ├─ 💰 Queried ledger                        │  ← child tools filtered by consultEntryId
│   └─ 📑 Generated report                      │
└───────────────────────────────────────────────┘
```

**Props:**
- `agentId`, `question`, `findings`, `status`, `toolEntryIds`
- `childTools: ToolEntry[]` — passed from parent grouping

**States:**
- `running`: copper pulse border (`border-l-copper`), animated ellipsis
- `done`: teal border, expandable findings markdown
- `error`: risk border, show error string

#### `apps/web/src/components/agent/AgentThread.tsx` (modify)

1. Group tool entries: if `entry.consultEntryId` set, nest under matching consult row.
2. Render consult entries via `ConsultTraceRow`.
3. Assistant entries: show `AgentPersonaBadge` when `agentId` present and ≠ governor.
4. `consult_agents` tool entry (Governor batch): render as **stack** of ConsultTraceRow placeholders linking to child consult entries by time proximity OR match `output.findings[].agentId`.

**Grouping algorithm (locked):**

```ts
function groupEntries(entries: ThreadEntry[]): RenderNode[] {
  // Walk chronologically; consult entries are parents;
  // tools with consultEntryId nest; other tools stay top-level;
  // assistant/user unchanged
}
```

5. When Governor synthesizes while consults running, show consult rows above streaming assistant text.

#### `apps/web/src/components/agent/ToolTraceRow.tsx` (modify)

- Add optional `agentId?: AgentId` — when set, prefix label: “Finance · Queried ledger”
- Add meta for `consult_agents`: `{ icon: "🤝", label: "Consulting specialists" }`
- Indent nested tools (`ml-4 border-l border-line/30`) when `nested` prop true

---

### B.5 GovernorDock integration

#### `apps/web/src/components/shell/GovernorDock.tsx` (modify)

1. Import `AgentSelector`, `useAgent().selectedAgentId`.
2. Header layout:

```tsx
<header>
  <AgentSelector personas={personas} selected={selectedAgentId} onSelect={setSelectedAgent} disabled={sending} />
  <span className="text-[12px] font-medium">Karya AI</span>
  <StatusDot ... />
</header>
```

3. Placeholder copy when persona ≠ governor:
   - Finance: “Ask about invoices, collections, or cash flow…”
4. Suggested prompts vary by persona:

| Persona | Extra chip |
|---------|------------|
| finance | “Collections priority” |
| procurement | “Stock below reorder” |
| sales | “At-risk promises” |
| operations | “This week’s meetings” |

5. When `selectedAgentId !== "governor"` and user sends, dock shows persona badge on user bubble (optional subtle tag).

---

### B.6 Streaming UX for consults

During Phase A, consult entries appear via `onConsultStart` → SSE `thread` events (same as tools).

**Verify:** `consultAgentsParallel` calls `onConsultStart` **before** LLM wait so UI shows “Consulting Finance Agent…” immediately.

Optional enhancement in `agent-runner.ts`:

```ts
export type AgentStreamEvent =
  | ... existing ...
  | { type: "consult-status"; agentId: AgentId; status: string };
```

Not required if thread snapshots suffice.

---

### B.7 Tests (Phase B)

#### `apps/web/src/components/agent/ConsultTraceRow.test.tsx` (NEW)
- Renders running copper state
- Expands findings on click when done

#### `apps/web/src/components/agent/AgentSelector.test.tsx` (NEW)
- Lists 5 personas; fires onSelect

#### `apps/web/src/components/agent/AgentThread.test.tsx` (NEW or extend)
- Groups tool under consult parent
- Shows persona badge on finance assistant message

---

### B.8 User experience after Phase B (full demo)

1. Open dock → default **Governor** selected.
2. Ask: “Can we give Org:Rangoli-Retail a 10% discount on their next order?”
3. See sequential/parallel blocks:
   - “Consulting Finance Agent…” → ledger/report tools → findings
   - “Consulting Sales Agent…” → order book / quote tools → findings
   - “Consulting Procurement Agent…” → cost tools → findings
4. Governor bubble (no badge or 🎯): unified recommendation with attributed insights.
5. Switch selector to **Finance Agent** → ask “What’s overdue?” → direct finance reply with 💰 badge, no consult rows.
6. Switch back to Governor → cross-domain questions delegate again.

**Demo differentiator:** Visible multi-agent collaboration traces — not a monolithic chatbot paragraph.

---

## 4. File Summary

### New files

```
packages/agents/src/registry.ts
packages/agents/src/registry.test.ts
packages/agents/src/prompts/base.ts
packages/agents/src/prompts/governor.ts
packages/agents/src/prompts/finance.ts
packages/agents/src/prompts/procurement.ts
packages/agents/src/prompts/sales.ts
packages/agents/src/prompts/operations.ts
packages/agents/src/consult.ts
packages/agents/src/consult.test.ts
packages/agents/src/specialist.ts
packages/agents/src/specialist.test.ts
packages/agents/src/tracing.ts
packages/agents/src/tools/partition.ts
apps/web/src/components/agent/AgentSelector.tsx
apps/web/src/components/agent/AgentSelector.test.tsx
apps/web/src/components/agent/AgentPersonaBadge.tsx
apps/web/src/components/agent/ConsultTraceRow.tsx
apps/web/src/components/agent/ConsultTraceRow.test.tsx
```

### Modified files

```
packages/agents/src/types.ts
packages/agents/src/system-prompt.ts
packages/agents/src/governor.ts
packages/agents/src/tools/index.ts
packages/agents/src/tools/schemas.ts
packages/agents/src/index.ts
apps/api/src/services/agent-runner.ts
apps/api/src/routes/agent.ts
apps/api/src/test/agent.test.ts
apps/web/src/lib/api.ts
apps/web/src/lib/agent-context.tsx
apps/web/src/components/agent/AgentThread.tsx
apps/web/src/components/agent/ToolTraceRow.tsx
apps/web/src/components/shell/GovernorDock.tsx
```

---

## 5. Architectural Decisions & Trade-offs

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Separate LLM calls | **Yes** — `generateText` per consult | True multi-agent reasoning; demo-visible latency acceptable |
| Parallel consults | **`Promise.all` in `consult_agents`** | Matches CFO discount example; bounded max 4 |
| Tool reuse | **Partition only** — no new business tools | Constraint; faster delivery |
| Consult entry kind | **New `consult` thread entry** | Clean UI grouping vs overloading tool rows |
| Direct chat | **Same thread, different prompt/tools** | Continuity; user can switch persona mid-thread |
| Background monitoring | **Out of scope** | Event scheduler can later trigger specialist scans |
| Governor default | **Unchanged API default** | Backward compatible |

### Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Governor over-consults (cost/latency) | Prompt: consult only for cross-domain; single-domain answer directly |
| Double approval cards | Specialists return drafts; Governor owns final money execution |
| Thread clutter | Group consult + child tools collapsible |
| Old mobile/API clients | New entry kinds ignored safely; `agentId` optional |

---

## 6. Out of Scope (this plan)

- Proactive specialist cron (“Finance Agent noticed 3 overdue invoices overnight”)
- Separate threads per persona
- Inter-specialist messaging (Finance → Procurement without Governor)
- New ERP tools (work order API tools — operations uses graph read + calendar)
- Embedding-based routing (“which agent should answer?” classifier)

---

## 7. Verification Checklist

After Phase A + B:

- [ ] `pnpm test` passes (registry, consult, specialist, UI component tests)
- [ ] `GET /v1/agent/personas` returns 5 personas
- [ ] Default message without `agentId` works as before
- [ ] Cross-domain prompt creates `consult` entries + Governor synthesis
- [ ] Finance direct chat uses only finance tool partition
- [ ] UI selector switches persona and persists for session
- [ ] ConsultTraceRow shows running → done with nested tools
- [ ] Approval flow unchanged for payment links and PO drafts
- [ ] Demo script: 10% discount question shows 3 consult blocks + unified answer

---

## 8. Demo Script (post Phase B)

1. **Governor mode** → “Can we give Rangoli Retail 10% discount?” → watch 3 consult traces → unified 7% recommendation.
2. **Switch to Finance** → “Who owes us money?” → direct collections answer.
3. **Switch to Procurement** → “Do we need to reorder brass?” → sourcing analysis.
4. **Back to Governor** → “Why is margin falling?” → consults Finance + Procurement + Sales → synthesis.
5. **Point to traces** — “Each department agent investigated independently; Governor coordinated.”
