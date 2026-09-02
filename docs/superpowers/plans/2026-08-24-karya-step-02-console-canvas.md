# Karya Step 2 — Console Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static node index with an interactive XYFlow graph canvas, node inspectors, dense object tables for orders and inventory, and a command palette — all wired through the existing `/v1` read API. Nav rail routes between Inbox, Graph, Orders, and Inventory without leaving the three-pane shell.

**Architecture:** `apps/web` gains a view router inside `Console.tsx`. Graph data is assembled client-side from `GET /v1/nodes` plus merged `GET /v1/neighborhood` responses (no new API routes). Custom XYFlow node components encode spec §6.2 shapes. Selection state is shared: clicking a node anywhere opens the same inspector overlay inside the canvas column.

**Tech Stack:** Next.js 15 (existing), `@xyflow/react` ^12, `d3-force` ^3 for one-shot force layout, Vitest + `@testing-library/react` for component tests, existing `@karya/tokens`.

## Global Constraints

Copied from Step 1 and spec §5–§6. Every task inherits these.

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. No `any`.
- **No new API routes.** All data from: `/v1/nodes`, `/v1/nodes/:key`, `/v1/neighborhood`, `/v1/path`, `/v1/impact`, `/v1/exceptions`, `/v1/bootstrap`.
- No Razorpay calls, no policy engine, no LLM, no agents beyond the idle AgentRail copy from Step 1.
- UI tokens only (ink, surface, surface-2, line, text, muted, copper, teal, signal, risk, warn). No shadcn CLI, no icon packs, no Inter, no purple gradients.
- Node shapes are fixed per spec §6.2 — one shape component per `NodeType`, no generic circles for everything.
- Motion: panel transitions 120–180ms ease-out. Graph nodes ease into layout positions; no bounce physics after initial layout.
- `orgId` remains `org_arka` via `x-org-id` header.
- Object table rows **are** graph nodes. Selecting a row sets the same `selectedNodeKey` as clicking a canvas node.
- Do not remove Inbox or ExceptionList — Inbox stays the default landing view.

---

## File structure (this step creates / modifies)

```
apps/web/package.json                              add @xyflow/react, d3-force
apps/web/src/lib/api.ts                            extend types + format helpers
apps/web/src/lib/graph-data.ts                     merge nodes/edges from /v1
apps/web/src/lib/graph-layout.ts                   d3-force positions
apps/web/src/lib/format.ts                         INR, dates, status chips
apps/web/src/lib/console-context.tsx               shared selection + view state
apps/web/src/components/Console.tsx                  view router (modify)
apps/web/src/components/shell/NavRail.tsx          active view + navigation (modify)
apps/web/src/components/shell/icons.tsx            unchanged
apps/web/src/components/graph/GraphCanvas.tsx
apps/web/src/components/graph/GraphCanvas.css      XYFlow overrides (dark well)
apps/web/src/components/graph/KaryaNode.tsx        shape router
apps/web/src/components/graph/shapes/*.tsx           one file per shape family
apps/web/src/components/graph/NodeInspector.tsx    slide-in panel
apps/web/src/components/graph/GraphMiniMap.tsx     optional inset minimap
apps/web/src/components/graph/NodeIndex.tsx          keep for Inbox side panel OR remove if redundant — keep as compact list under Inbox
apps/web/src/components/tables/ObjectTable.tsx     shared dense table primitive
apps/web/src/components/tables/OrdersTable.tsx
apps/web/src/components/tables/InventoryTable.tsx
apps/web/src/components/tables/orders-columns.ts   pure column defs + edge lookups
apps/web/src/components/tables/inventory-columns.ts
apps/web/src/components/command/CommandPalette.tsx
apps/web/src/components/command/commands.ts        static command registry
apps/web/src/lib/graph-data.test.ts
apps/web/src/lib/format.test.ts
apps/web/src/components/graph/KaryaNode.test.tsx
```

No changes to `apps/api`, `packages/graph`, or `packages/seed` in this step.

---

## Design bar (read before touching UI)

- Graph canvas background: `surface-2` (`#1B1F26`). XYFlow controls minimal — zoom only, bottom-left, mono labels.
- Edges default `signal` (#6B8CFF) at 1px. On node hover, incident edges go to 2px and full opacity; others fade to 30%.
- Payment nodes render with `teal` fill regardless of hover.
- Inspector slides from the **right edge of the canvas column** (not the agent rail), width 320px, `surface` background, hairline `line` border-left. Transition `transform 150ms ease-out`.
- Orders table columns: ID (mono), Type, Counterparty, Status, Promise/Due, Amount. Purchase orders show vendor; sales orders show customer. Status uses warn/risk/teal left dot — no rainbow badges.
- Inventory table columns: Item (SKU or Material key), Label, On hand, Reserved, Available, Location, Reorder flag.
- Command palette: centered overlay, max-width 480px, `surface` panel, mono search input. Trigger: `Ctrl+K` / `Cmd+K`. Actions include navigation and “Focus {node key}”.
- Nav rail: enable **Graph**, **Inbox**, **Orders**, **Inventory**. Money / People / Calendar / Listings stay disabled with tooltip “Step N” (Money = Step 3, People = Step 9, etc.).

---

### Task 1: Dependencies and shared lib types

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/lib/format.ts`
- Create: `apps/web/src/lib/format.test.ts`
- Modify: `apps/web/src/lib/api.ts`

**Interfaces:**
- Consumes: existing API responses
- Produces: formatting helpers and extended client types

- [ ] **Step 1: Add dependencies**

In `apps/web/package.json` dependencies:

```json
"@xyflow/react": "^12.6.4",
"d3-force": "^3.0.0"
```

Dev dependencies:

```json
"@types/d3-force": "^3.0.10",
"@testing-library/react": "^16.3.0",
"@testing-library/jest-dom": "^6.6.3",
"jsdom": "^26.1.0"
```

Vitest config (create `apps/web/vitest.config.ts` if missing):

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "jsdom" },
});
```

- [ ] **Step 2: Extend `api.ts` types**

Add to `apps/web/src/lib/api.ts`:

```ts
export type ApiEdge = {
  _id: string;
  type: string;
  fromId: string;
  toId: string;
  props: Record<string, string | number | boolean | null>;
};

export type ApiNodeFull = ApiNode & {
  props: Record<string, string | number | boolean | null>;
};

export type ConsoleView = "inbox" | "graph" | "orders" | "inventory";

/** Anchor keys for merging neighborhood edges — covers Arka seed connected components */
export const GRAPH_ANCHOR_KEYS = [
  "Org:Arka-Atelier",
  "SalesOrder:SO-218",
  "PurchaseOrder:PO-104",
  "Invoice:INV-90",
  "SalesOrder:SO-201",
] as const;
```

Keep existing exports. Do not add new fetch paths beyond `/v1/*`.

- [ ] **Step 3: Format helpers**

`apps/web/src/lib/format.ts`:

```ts
export function formatInr(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(2)}L`;
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)}k`;
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function formatQty(n: number, uom?: string | null): string {
  const base = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return uom ? `${base} ${uom}` : base;
}

export type StatusTone = "teal" | "warn" | "risk" | "muted";

export function orderStatusTone(status: string | null | undefined): StatusTone {
  if (!status) return "muted";
  if (["paid", "received", "delivered", "shipped", "packed"].includes(status)) return "teal";
  if (["late", "delayed", "overdue", "promised", "open"].includes(status)) return "warn";
  if (["failed", "expired", "cancelled"].includes(status)) return "risk";
  return "muted";
}
```

Tests in `format.test.ts`: `formatInr(42000000)` → `₹4.20L`, `formatInr(1480000)` → `₹14.8k`, tone mapping for `late` → `warn`.

---

### Task 2: Graph data loader (client-side edge merge)

**Files:**
- Create: `apps/web/src/lib/graph-data.ts`
- Create: `apps/web/src/lib/graph-data.test.ts`

**Interfaces:**
- Consumes: `api()`, `neighborhoodPath()`, `GRAPH_ANCHOR_KEYS`
- Produces: `loadGraphSnapshot(): Promise<GraphSnapshot>`

```ts
export type GraphSnapshot = {
  nodes: ApiNodeFull[];
  edges: ApiEdge[];
  nodeById: Map<string, ApiNodeFull>;
  nodeByKey: Map<string, ApiNodeFull>;
};

export async function loadGraphSnapshot(): Promise<GraphSnapshot> {
  const [{ nodes }, ...neighborhoods] = await Promise.all([
    api<{ nodes: ApiNodeFull[] }>("/v1/nodes"),
    ...GRAPH_ANCHOR_KEYS.map((key) =>
      api<{ center: ApiNodeFull; nodes: ApiNodeFull[]; edges: ApiEdge[] }>(
        neighborhoodPath(key, 2),
      ).catch(() => null),
    ),
  ]);

  const edgeMap = new Map<string, ApiEdge>();
  for (const hood of neighborhoods) {
    if (!hood?.edges) continue;
    for (const edge of hood.edges) {
      edgeMap.set(edge._id, edge);
    }
  }

  const nodeById = new Map(nodes.map((n) => [n._id, n]));
  const nodeByKey = new Map(nodes.map((n) => [n.key, n]));

  return {
    nodes,
    edges: [...edgeMap.values()],
    nodeById,
    nodeByKey,
  };
}
```

- [ ] **Step 1: Tests with mocked `api`**

Mock fetch; assert merged edge count ≥ 15 on synthetic responses shaped like the seed.

- [ ] **Step 2: Implement until tests pass**

Run: `pnpm --filter @karya/web test`

---

### Task 3: Force layout

**Files:**
- Create: `apps/web/src/lib/graph-layout.ts`

**Interfaces:**
- Consumes: `GraphSnapshot`
- Produces: `layoutGraph(snapshot, width, height): Map<string, { x: number; y: number }>`

```ts
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from "d3-force";
import type { GraphSnapshot } from "./graph-data";

export function layoutGraph(
  snapshot: GraphSnapshot,
  width: number,
  height: number,
): Map<string, { x: number; y: number }> {
  const nodes = snapshot.nodes.map((n) => ({
    id: n._id,
    x: width / 2 + (Math.random() - 0.5) * 40,
    y: height / 2 + (Math.random() - 0.5) * 40,
  }));

  const nodeIndex = new Map(nodes.map((n, i) => [n.id, i]));

  const links = snapshot.edges
    .filter((e) => nodeIndex.has(e.fromId) && nodeIndex.has(e.toId))
    .map((e) => ({
      source: nodeIndex.get(e.fromId)!,
      target: nodeIndex.get(e.toId)!,
    }));

  const sim = forceSimulation(nodes)
    .force(
      "link",
      forceLink(links)
        .distance(90)
        .strength(0.4),
    )
    .force("charge", forceManyBody().strength(-220))
    .force("center", forceCenter(width / 2, height / 2))
    .force("collide", forceCollide(28));

  sim.stop();
  for (let i = 0; i < 300; i++) sim.tick();

  return new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
}
```

Positions are computed once per full snapshot load, then frozen (no continuous simulation).

---

### Task 4: Console context and NavRail routing

**Files:**
- Create: `apps/web/src/lib/console-context.tsx`
- Modify: `apps/web/src/components/shell/NavRail.tsx`
- Modify: `apps/web/src/components/Console.tsx`

**Interfaces:**
- Produces: `ConsoleProvider`, `useConsole()` hook

```ts
export type ConsoleContextValue = {
  view: ConsoleView;
  setView: (view: ConsoleView) => void;
  selectedNodeKey: string | null;
  selectNode: (key: string | null) => void;
  focusNode: (key: string) => void; // sets selected + switches to graph view
  graph: GraphSnapshot | null;
  exceptions: ApiException[];
  bootstrap: Bootstrap | null;
  reload: () => Promise<void>;
};
```

- [ ] **Step 1: NavRail props**

Replace hard-coded `active = id === "inbox"` with:

```ts
type NavRailProps = {
  activeView: ConsoleView;
  onNavigate: (view: ConsoleView) => void;
  exceptionCount: number;
};
```

Enable `graph`, `inbox`, `orders`, `inventory` (`enabled: true`). Active item: copper left border. Map nav `id` to `ConsoleView`:

| nav id | ConsoleView |
|---|---|
| graph | graph |
| inbox | inbox |
| orders | orders |
| inventory | inventory |

Other items: `enabled: false`, tooltip `"Step 3"` for money, `"Step 9"` for people/calendar/listings.

- [ ] **Step 2: ConsoleProvider**

`Console.tsx` wraps content in `ConsoleProvider`. On mount: `seedOnceIfEmpty()`, then `loadGraphSnapshot()`, bootstrap, exceptions. Store in context.

`focusNode(key)`: `setSelectedNodeKey(key); setView("graph");`

ExceptionList `onSelect`: call `focusNode(nodeKey)` instead of only `setSelectedKey`.

- [ ] **Step 3: View switch**

```tsx
function CanvasBody() {
  const { view } = useConsole();
  switch (view) {
    case "inbox": return <InboxView />;
    case "graph": return <GraphView />;
    case "orders": return <OrdersTable />;
    case "inventory": return <InventoryTable />;
  }
}
```

`InboxView`: existing two-column ExceptionList + NodeIndex (NodeIndex rows clickable → `focusNode`).

---

### Task 5: XYFlow custom nodes (spec §6.2 shapes)

**Files:**
- Create: `apps/web/src/components/graph/shapes/` (see shape map below)
- Create: `apps/web/src/components/graph/KaryaNode.tsx`
- Create: `apps/web/src/components/graph/KaryaNode.test.tsx`
- Create: `apps/web/src/components/graph/GraphCanvas.css`

**Interfaces:**
- Consumes: `@xyflow/react` `NodeProps`
- Produces: `nodeTypes` registry for `<ReactFlow nodeTypes={...} />`

**Shape map (lock this — do not improvise):**

| NodeType | Component file | SVG shape |
|---|---|---|
| Person | `CircleNode.tsx` | circle r=14 |
| Org | `HexagonNode.tsx` | flat-top hexagon w=32 h=28 |
| SKU | `RoundedSquareNode.tsx` | rect rx=6 28×28 |
| Material | `DiamondNode.tsx` | rotated square 24×24 |
| Stock | `SmallSquareNode.tsx` | rect 18×18 |
| Location | `PinNode.tsx` | teardrop pin |
| SalesOrder | `ChevronRightNode.tsx` | chevron pointing right |
| PurchaseOrder | `ChevronLeftNode.tsx` | chevron pointing left |
| Shipment | `CapsuleNode.tsx` | pill 36×18 |
| Invoice | `DocumentNode.tsx` | doc with folded corner |
| Payment | `PaymentDiscNode.tsx` | filled circle r=12, fill `teal` |
| Lead | `RingNode.tsx` | circle stroke-only r=14 |
| Listing | `TagNode.tsx` | tag pentagon |
| Meeting | `ClockNode.tsx` | circle + hands |
| Message | `QuoteNode.tsx` | speech quote |
| Task | `CheckNode.tsx` | square + check |
| Policy | `ShieldNode.tsx` | shield |
| Document | `FileNode.tsx` | file |
| Event | `DotNode.tsx` | dot r=6 |

Shared wrapper `KaryaNode.tsx`:

```tsx
export type KaryaNodeData = {
  nodeKey: string;
  label: string;
  nodeType: string;
  selected: boolean;
  highlighted: boolean; // incident to hovered node
  exceptionSeverity?: "risk" | "warn" | null;
};

export function KaryaNode(props: NodeProps<KaryaNodeData>) {
  const Shape = SHAPE_BY_TYPE[props.data.nodeType] ?? DotNode;
  return (
    <div className="karya-node" data-selected={props.data.selected}>
      <Shape {...props} />
      <div className="karya-node-label">{props.data.label}</div>
    </div>
  );
}
```

CSS (`GraphCanvas.css`):

```css
.react-flow { background: var(--surface-2); }
.react-flow__edge-path { stroke: var(--signal); stroke-width: 1; }
.react-flow__edge.highlighted .react-flow__edge-path { stroke-width: 2; opacity: 1; }
.react-flow__edge.faded .react-flow__edge-path { opacity: 0.3; }
.karya-node-label { font-family: var(--font-mono); font-size: 10px; color: var(--muted); max-width: 80px; text-align: center; }
.karya-node[data-selected="true"] .shape-fill { stroke: var(--copper); stroke-width: 2; }
```

Default node fill: transparent with `line` stroke. Exception nodes: 2px left border color on shape (`risk` or `warn`) from props.

Test: render `KaryaNode` for type `Payment` — snapshot or assert teal fill class present.

---

### Task 6: GraphCanvas

**Files:**
- Create: `apps/web/src/components/graph/GraphCanvas.tsx`
- Create: `apps/web/src/components/graph/GraphMiniMap.tsx` (optional, ≤80 lines)

**Interfaces:**
- Consumes: `useConsole()`, `layoutGraph`, `@xyflow/react`
- Produces: interactive canvas with selection + hover edge highlighting

```tsx
type GraphCanvasProps = {
  onNodeSelect: (key: string) => void;
  selectedNodeKey: string | null;
};
```

- [ ] **Step 1: Build XYFlow nodes/edges**

```ts
function toFlowNodes(snapshot: GraphSnapshot, positions: Map<string, {x,y}>, ...): Node[] {
  return snapshot.nodes.map((n) => ({
    id: n._id,
    type: "karya",
    position: positions.get(n._id) ?? { x: 0, y: 0 },
    data: {
      nodeKey: n.key,
      label: n.label,
      nodeType: n.type,
      selected: n.key === selectedNodeKey,
      highlighted: highlightedIds.has(n._id),
      exceptionSeverity: exceptionByNodeId.get(n._id) ?? null,
    },
  }));
}

function toFlowEdges(snapshot: GraphSnapshot, hoveredId: string | null): Edge[] {
  return snapshot.edges.map((e) => ({
    id: e._id,
    source: e.fromId,
    target: e.toId,
    label: e.type,
    className: edgeClassName(e, hoveredId),
  }));
}
```

- [ ] **Step 2: Interaction**

- `onNodeClick`: `onNodeSelect(node.data.nodeKey)`
- `onPaneClick`: clear selection
- `onNodeMouseEnter` / `Leave`: set `hoveredNodeId` for edge highlighting
- `fitView` on first layout with padding 0.2
- When `selectedNodeKey` changes, `setCenter` on that node (XYFlow `useReactFlow`)

- [ ] **Step 3: Import CSS**

In `GraphCanvas.tsx`: `import "@xyflow/react/dist/style.css"; import "./GraphCanvas.css";`

Wrap in `<ReactFlowProvider>` at `GraphView` level.

Container: `className="h-full w-full bg-surface-2"`, min height fills canvas area below header.

---

### Task 7: NodeInspector (slide-in panel)

**Files:**
- Create: `apps/web/src/components/graph/NodeInspector.tsx`

**Interfaces:**
- Consumes: `selectedNodeKey`, `graph.nodeByKey`, `api` for live neighborhood
- Produces: inspector overlay inside canvas

```tsx
type NodeInspectorProps = {
  nodeKey: string;
  onClose: () => void;
};
```

Layout:

```
┌─────────────────────────────┐
│ [mono key]            [×]   │
│ Label (15px)                │
│ Type · created meta         │
├─────────────────────────────┤
│ Properties (props table)    │
│ key → value, mono for IDs   │
├─────────────────────────────┤
│ Linked (depth-1 neighborhood)│
│ edge type → neighbor key    │
├─────────────────────────────┤
│ [Focus graph] [View impact] │  ← impact switches nothing yet; logs key for Step 5
└─────────────────────────────┘
```

- Fixed position `absolute right-0 top-0 bottom-0 w-[320px]`
- Transform: closed `translateX(100%)`, open `translateX(0)`, transition 150ms ease-out
- Props table: skip nulls; format `*InPaise` with `formatInr`, dates as locale string
- Fetch neighborhood on open: `GET /v1/neighborhood?key={nodeKey}&depth=1`
- Close button and Escape key call `onClose`

Parent `GraphView` structure:

```tsx
<div className="relative flex min-h-0 flex-1 flex-col">
  <GraphCanvas ... />
  {selectedNodeKey ? (
    <NodeInspector nodeKey={selectedNodeKey} onClose={() => selectNode(null)} />
  ) : null}
</div>
```

Inspector also appears when a table row is selected and user is on Orders/Inventory (panel overlays table, same component).

---

### Task 8: Object tables

**Files:**
- Create: `apps/web/src/components/tables/ObjectTable.tsx`
- Create: `apps/web/src/components/tables/orders-columns.ts`
- Create: `apps/web/src/components/tables/inventory-columns.ts`
- Create: `apps/web/src/components/tables/OrdersTable.tsx`
- Create: `apps/web/src/components/tables/InventoryTable.tsx`

**Interfaces:**
- Consumes: `GraphSnapshot`, `useConsole()`
- Produces: dense tables per spec §5.5

**ObjectTable** generic:

```tsx
export type Column<T> = {
  id: string;
  header: string;
  width?: string;
  mono?: boolean;
  render: (row: T) => ReactNode;
};

type ObjectTableProps<T> = {
  rows: T[];
  columns: Column<T>[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  emptyCopy: string;
};
```

Styling: full-width, row height 36px, hairline row borders, hover `bg-surface`, selected `bg-surface-2`, header sticky, `font-mono tabular-nums` for numeric columns.

**OrdersTable** rows:

```ts
export type OrderRow = {
  key: string;
  orderType: "SalesOrder" | "PurchaseOrder";
  label: string;
  status: string;
  counterparty: string | null; // Org label from BUYS (sales) or vendor from PO edges
  dateLabel: string | null;      // promise_date or expectedAt
  amountLabel: string | null;    // from linked Invoice if any
};
```

Build rows in `orders-columns.ts`:

```ts
export function buildOrderRows(snapshot: GraphSnapshot): OrderRow[] {
  // SalesOrder + PurchaseOrder nodes
  // For SalesOrder: find BUYS edge where toId = so._id → counterparty org label
  // For PurchaseOrder: find SUPPLIES / ORDER_CONTAINS material → trace to vendor Org via reverse SUPPLIES
  // Simpler locked rule: PO counterparty = first Org with SUPPLIES edge to material on PO's ORDER_CONTAINS
  // Invoice amount: edge INVOICES from Invoice → SO
}
```

Sort: risk first (late/overdue/promised), then key alpha.

**InventoryTable** rows:

```ts
export type InventoryRow = {
  key: string;
  kind: "SKU" | "Material" | "Stock";
  label: string;
  onHand: number | null;
  reserved: number | null;
  available: number | null;
  location: string | null;
  reorderFlag: boolean;
};
```

Include:
- All `Stock` nodes (primary rows — show on_hand, reserved, available = on_hand - reserved)
- All `SKU` without stock row (on_hand null — show “—”)
- All `Material` with reorder_point — reorderFlag if any Stock for SKUs MADE_FROM this material has available < reorder_point (approximation OK: flag Material if `props.reorder_point` > 0 and no stock)

---

### Task 9: Command palette

**Files:**
- Create: `apps/web/src/components/command/CommandPalette.tsx`
- Create: `apps/web/src/components/command/commands.ts`

**Interfaces:**
- Consumes: `useConsole()`, `graph.nodeByKey`
- Produces: global ⌘K palette

```tsx
type Command = {
  id: string;
  label: string;
  keywords?: string;
  run: () => void;
};

export function buildCommands(ctx: ConsoleContextValue): Command[] {
  const nav = (view: ConsoleView, label: string): Command => ({
    id: `nav-${view}`,
    label,
    run: () => ctx.setView(view),
  });

  const nodeCommands = ctx.graph?.nodes.map((n) => ({
    id: `focus-${n.key}`,
    label: `Focus ${n.key}`,
    keywords: `${n.label} ${n.type}`,
    run: () => ctx.focusNode(n.key),
  })) ?? [];

  return [
    nav("inbox", "Go to Inbox"),
    nav("graph", "Go to Graph"),
    nav("orders", "Go to Orders"),
    nav("inventory", "Go to Inventory"),
    ...nodeCommands,
  ];
}
```

UI:
- Listen `keydown` on document: `(metaKey || ctrlKey) && key === 'k'` → preventDefault, open
- Backdrop `bg-ink/60`, panel centered
- Filter: case-insensitive match on label + keywords
- Arrow up/down + Enter to run
- Escape closes

Mount `<CommandPalette />` once inside `ConsoleProvider`.

---

### Task 10: Integration and visual QA

**Files:**
- Modify: `apps/web/src/components/Console.tsx` (final wiring)
- Modify: `apps/web/src/components/inbox/ExceptionList.tsx` (use focusNode from context if refactored)

- [ ] **Step 1: Canvas header persists across views**

Keep `CanvasHeader` with Karya wordmark + org label above `CanvasBody`.

- [ ] **Step 2: Agent rail unchanged**

AgentRail still shows idle Governor copy. Footer: “Approval cards appear here when money moves.” No fake approvals.

- [ ] **Step 3: Manual checklist**

Run `pnpm dev`. Confirm:

1. Nav switches Inbox / Graph / Orders / Inventory without full page reload.
2. Graph shows ≥20 nodes, shaped by type; Payment nodes are teal.
3. Click `SalesOrder:SO-218` → inspector shows promise_date, 8 qty, linked Lotus Boutique.
4. Exception row click → jumps to Graph view, selects node, inspector open.
5. Orders table lists SO-218, SO-201, PO-104 with sensible counterparties.
6. Inventory shows Diya-Large @ Workshop 12 / 9 / 3 available.
7. ⌘K → “Focus PurchaseOrder:PO-104” works.
8. No white backgrounds, no shadcn class names, 1280×800 layout holds.

Run: `pnpm --filter @karya/web typecheck && pnpm --filter @karya/web test`

---

## Done when

- `@xyflow/react` graph renders the Arka seed with type-specific shapes per §6.2.
- Node inspector slides in on selection; shows props and depth-1 links.
- Orders and Inventory tables are nav-routable; row select opens the same inspector.
- Command palette navigates and focuses nodes.
- All data comes from existing `/v1` routes (edge merge via neighborhoods only).
- `pnpm --filter @karya/web test` and `typecheck` pass.
- No Razorpay, policy engine, or agent runtime added.

## Out of scope (step 3+)

Razorpay Payment Links, webhooks, audit log API, policy engine, approval cards, Money nav view, agent tool traces, `/a2a`, Auth.js, AWS deploy.

---

## Self-review

- Spec §5.4 layout preserved — three panes, nav routing inside canvas only.
- Spec §6.2 shapes — Task 5 shape map is closed.
- Spec §5.5 object table + graph inspector — Tasks 7–8.
- Spec §14 item 2 — console canvas without agents.
- Step 1 API untouched — no new routes; graph-data merge documented.
- Types: `ConsoleView`, `GraphSnapshot`, `KaryaNodeData`, `OrderRow`, `InventoryRow` locked.
- No TBD. Disabled nav tooltips point to future steps explicitly.
