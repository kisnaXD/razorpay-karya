# Karya Step 1 — Foundation & GraphStore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Karya monorepo so a seeded Arka Atelier knowledge graph lives in MongoDB, is queryable through a Fastify API, and is visible in a Next.js shell that already looks like the product — not a default dashboard.

**Architecture:** pnpm workspace. `packages/graph` owns nodes, edges, and queries. `packages/seed` owns the demo world. `apps/api` is the only writer to Mongo. `apps/web` is a viewport. Next.js does not talk to Mongo. AWS is the production target; this step runs locally on Docker Mongo.

**Tech Stack:** TypeScript 5.8 strict, Node.js 22, pnpm 9, Next.js 15, Fastify 5, MongoDB 8 (official Docker image), native `mongodb` driver, Zod 3, Vitest 3, Tailwind 3, `next/font` (Newsreader + IBM Plex Sans + IBM Plex Mono).

## Global Constraints

Copied from `docs/specs/2026-08-24-karya-agentic-erp.md`. Every task inherits these.

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. No `any`.
- Node types and edge types are closed enums. The LLM (later) may not invent names.
- Graph is the system of record. No parallel “orders” SQL table.
- Deletes are rare. Edges carry `validFrom` / `validTo`. Mutation of a relationship **supersedes** (new edge + `SUPERSEDES` + old `validTo`).
- Money never appears in this step except as seeded `Invoice` / `Payment` nodes. No Razorpay calls.
- UI tokens only: ink `#0C0E12`, surface `#14171C`, surface-2 `#1B1F26`, line `#2A3038`, text `#E8EAED`, muted `#8B919C`, copper `#D4894A`, teal `#2DB89A`, signal `#6B8CFF`, risk `#E25D5D`, warn `#E0B44A`.
- Type: Newsreader italic for the word *Karya* only. IBM Plex Sans 13px UI. IBM Plex Mono for IDs, SKUs, rupees.
- No shadcn CLI, no Inter, no emoji icons, no gradient backgrounds, no card-grid “SaaS landing” inside the app.
- Visual references: Linear (density, restraint), a night trading terminal (status strip), Mercury (quiet money). Steal discipline, not chrome.
- `orgId` on every document. Step 1 has one org: `org_arka`.
- API port `4000`. Web port `3000`. Mongo `27017`.
- Do not deploy to AWS in this step. Do not add CDK, ECS, or GitHub Actions yet.
- Do not add an LLM, Playwright, or Razorpay SDK.

---

## File structure (this step creates)

```
package.json                         pnpm workspaces
pnpm-workspace.yaml
tsconfig.base.json
.eslintrc.cjs
.prettierrc
.gitignore
.env.example
docker-compose.yml                   mongo:8
apps/api/package.json
apps/api/tsconfig.json
apps/api/src/index.ts                Fastify entry
apps/api/src/app.ts                  plugin registration
apps/api/src/env.ts                  Zod env
apps/api/src/mongo.ts                client + indexes
apps/api/src/routes/health.ts
apps/api/src/routes/graph.ts
apps/api/src/routes/seed.ts          POST /v1/admin/seed (dev)
apps/web/package.json
apps/web/next.config.ts              rewrites /v1 → api
apps/web/src/app/layout.tsx
apps/web/src/app/globals.css         token CSS
apps/web/src/app/page.tsx            console shell
apps/web/src/lib/api.ts
apps/web/src/components/shell/AppShell.tsx
apps/web/src/components/shell/NavRail.tsx
apps/web/src/components/shell/AgentRail.tsx
apps/web/src/components/shell/StatusStrip.tsx
apps/web/src/components/inbox/ExceptionList.tsx
apps/web/src/components/graph/NodeIndex.tsx
packages/tokens/src/index.ts         CSS variables + TS constants
packages/graph/src/types.ts
packages/graph/src/ids.ts
packages/graph/src/store.ts          GraphStore
packages/graph/src/exceptions.ts     derived exception rules
packages/graph/src/index.ts
packages/graph/src/store.test.ts
packages/seed/src/arka.ts            Arka Atelier world
packages/seed/src/arka.test.ts
packages/seed/src/index.ts
```

No `apps/worker`, no `infra/`, no `packages/agents` in this step.

---

## Design bar for the shell (read before touching UI)

The first screen must feel like an instrument, not a template.

- Full-viewport `ink` background. Hairline `line` borders. No drop shadows. No rounded-2xl blobs.
- 56px left icon rail, 360px right agent rail, 32px bottom status strip. Canvas takes the rest.
- Idle agent rail copy, not lorem: “Governor idle. Three exceptions need you.” Copper 2px left edge on the rail header.
- Inbox is the default canvas: exception rows with risk-tinted left edge, mono IDs, one-line consequence copy.
- Beside / under it, a **node index** grouped by type (not JSON, not a force-directed graph yet — that is step 2 / XYFlow).
- Status strip: `₹4.20L test balance` (seeded prop on merchant org), exception count, `graph · synced just now`.
- Empty agent thread is still *designed*. Never a blank white column.

---

### Task 1: Monorepo, toolchain, Mongo

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.eslintrc.cjs`, `.prettierrc`, `.gitignore`, `.env.example`, `docker-compose.yml`
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`
- Create: `packages/graph/package.json`, `packages/graph/tsconfig.json`
- Create: `packages/seed/package.json`, `packages/seed/tsconfig.json`
- Create: `packages/tokens/package.json`, `packages/tokens/tsconfig.json`

**Interfaces:**
- Consumes: nothing
- Produces: `pnpm -r typecheck` and `pnpm -r test` scripts that exist (tests may be empty until Task 3)

- [ ] **Step 1: Workspace root**

`package.json`:

```json
{
  "name": "karya",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "pnpm --parallel --filter @karya/api --filter @karya/web dev",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "skipLibCheck": true
  }
}
```

Ignore: `node_modules`, `.next`, `dist`, `.env`, `coverage`.

- [ ] **Step 2: Local Mongo**

`docker-compose.yml`:

```yaml
services:
  mongo:
    image: mongo:8
    ports: ["27017:27017"]
    environment:
      MONGO_INITDB_DATABASE: karya
    volumes:
      - karya_mongo:/data/db
volumes:
  karya_mongo:
```

`.env.example`:

```
MONGO_URL=mongodb://127.0.0.1:27017/karya
API_PORT=4000
WEB_ORIGIN=http://localhost:3000
ORG_ID=org_arka
NODE_ENV=development
```

Package names: `@karya/graph`, `@karya/seed`, `@karya/tokens`, `@karya/api`, `@karya/web`. Each package `typecheck` script is `tsc --noEmit`. API/web `dev` scripts come in Tasks 5–6.

- [ ] **Step 3: Verify**

```
docker compose up -d
pnpm install
```

Expected: Mongo healthy, lockfile written, no app code required yet.

---

### Task 2: Tokens

**Files:**
- Create: `packages/tokens/src/index.ts`

**Interfaces:**
- Consumes: spec §5.2–5.3
- Produces: `tokens` object and `tokenCss` string

- [ ] **Step 1: Encode the spec, do not improvise**

```ts
export const tokens = {
  color: {
    ink: "#0C0E12",
    surface: "#14171C",
    surface2: "#1B1F26",
    line: "#2A3038",
    text: "#E8EAED",
    muted: "#8B919C",
    copper: "#D4894A",
    teal: "#2DB89A",
    signal: "#6B8CFF",
    risk: "#E25D5D",
    warn: "#E0B44A",
  },
  font: {
    display: '"Newsreader", Georgia, serif',
    sans: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, monospace',
  },
  space: { rail: 56, agent: 360, strip: 32 },
  type: { body: 13, meta: 12, title: 15 },
} as const;

export const tokenCss = `:root {
  --ink: ${tokens.color.ink};
  --surface: ${tokens.color.surface};
  --surface-2: ${tokens.color.surface2};
  --line: ${tokens.color.line};
  --text: ${tokens.color.text};
  --muted: ${tokens.color.muted};
  --copper: ${tokens.color.copper};
  --teal: ${tokens.color.teal};
  --signal: ${tokens.color.signal};
  --risk: ${tokens.color.risk};
  --warn: ${tokens.color.warn};
  --font-display: ${tokens.font.display};
  --font-sans: ${tokens.font.sans};
  --font-mono: ${tokens.font.mono};
}`;
```

If a later file needs a color that is not in this object, stop and reuse a token. Do not add a 12th color.

---

### Task 3: Graph types and GraphStore

**Files:**
- Create: `packages/graph/src/types.ts`
- Create: `packages/graph/src/ids.ts`
- Create: `packages/graph/src/store.ts`
- Create: `packages/graph/src/exceptions.ts`
- Create: `packages/graph/src/index.ts`
- Test: `packages/graph/src/store.test.ts`

**Interfaces:**
- Consumes: Mongo `Db`
- Produces: `GraphStore` class below

```ts
export const NODE_TYPES = [
  "Person", "Org", "SKU", "Material", "Stock", "Location",
  "SalesOrder", "PurchaseOrder", "Shipment", "Invoice", "Payment",
  "Lead", "Listing", "Meeting", "Message", "Task", "Policy",
  "Document", "Event",
] as const;

export const EDGE_TYPES = [
  "OWNS", "EMPLOYS", "CONTACT_AT", "SUPPLIES", "BUYS", "HAS_SKU",
  "MADE_FROM", "STOCK_OF", "LOCATED_AT", "ORDER_CONTAINS", "FULFILLS",
  "SHIPS", "INVOICES", "PAYS", "PAYS_OUT", "ABOUT", "FOLLOW_UP",
  "SOURCED_FROM", "LISTS", "GOVERNED_BY", "SUPERSEDES", "CAUSED",
] as const;

export type NodeType = (typeof NODE_TYPES)[number];
export type EdgeType = (typeof EDGE_TYPES)[number];

export type NodeRecord = {
  _id: string;
  orgId: string;
  type: NodeType;
  key: string;          // e.g. "SKU:Diya-Large" unique per org
  label: string;
  props: Record<string, string | number | boolean | null>;
  createdAt: Date;
  updatedAt: Date;
};

export type EdgeRecord = {
  _id: string;
  orgId: string;
  type: EdgeType;
  fromId: string;
  toId: string;
  props: Record<string, string | number | boolean | null>;
  validFrom: Date;
  validTo: Date | null; // null = current
  createdAt: Date;
};

export type GraphFilter = { at?: Date }; // TimeSlice: only edges where validFrom <= at && (validTo === null || validTo > at)

export class GraphStore {
  constructor(private readonly db: Db) {}

  async ensureIndexes(): Promise<void>;
  async upsertNode(input: Omit<NodeRecord, "createdAt" | "updatedAt">): Promise<NodeRecord>;
  async getNode(orgId: string, id: string): Promise<NodeRecord | null>;
  async getNodeByKey(orgId: string, key: string): Promise<NodeRecord | null>;
  async listNodes(orgId: string, type?: NodeType): Promise<NodeRecord[]>;

  /** Current edge. If a current edge of same org+type+from+to exists, supersede it. */
  async writeEdge(input: Omit<EdgeRecord, "createdAt" | "validTo"> & { validTo?: null }): Promise<EdgeRecord>;

  async neighborhood(orgId: string, nodeId: string, depth: 1 | 2, filter?: GraphFilter): Promise<{
    center: NodeRecord;
    nodes: NodeRecord[];
    edges: EdgeRecord[];
  }>;

  async path(orgId: string, fromId: string, toId: string, filter?: GraphFilter): Promise<{
    nodes: NodeRecord[];
    edges: EdgeRecord[];
  } | null>;

  async impact(orgId: string, nodeId: string, filter?: GraphFilter): Promise<{
    nodes: NodeRecord[];
    edges: EdgeRecord[];
  }>;

  async exceptions(orgId: string): Promise<Exception[]>;
}

export type ExceptionSeverity = "risk" | "warn";
export type Exception = {
  id: string;
  severity: ExceptionSeverity;
  code: "stock.promise_risk" | "shipment.delayed" | "invoice.overdue" | "payment.uncollected" | "po.late";
  nodeId: string;
  title: string;
  detail: string; // one sentence consequence, not a field dump
};
```

IDs: `node_` / `edge_` prefix + ulid (`ulid` package). `key` is the human-stable identifier.

Indexes:

```
nodes: unique { orgId: 1, key: 1 }
nodes: { orgId: 1, type: 1 }
edges: { orgId: 1, fromId: 1, validTo: 1 }
edges: { orgId: 1, toId: 1, validTo: 1 }
edges: { orgId: 1, type: 1, validTo: 1 }
```

Traversal rules:
- **Current graph:** `validTo === null` unless `filter.at` is set.
- **Neighborhood:** BFS undirected (follow from and to) up to `depth`. Return the induced subgraph.
- **Path:** BFS undirected, first path, max 8 hops. Used for “why are these related?”
- **Impact:** directed BFS along `ORDER_CONTAINS`, `FULFILLS`, `SHIPS`, `INVOICES`, `PAYS`, `STOCK_OF`, `MADE_FROM`, `HAS_SKU`, `BUYS`. This is “what breaks if this node fails.”
- **writeEdge:** find current twin (`orgId, type, fromId, toId, validTo: null`). If found, set `validTo = now` and insert a `SUPERSEDES` edge from new → old, then insert the new edge.

Exception rules (`packages/graph/src/exceptions.ts`), evaluated on the current graph:

1. `invoice.overdue` — `Invoice` with `props.status === "overdue"` OR (`dueAt` < now AND status not `paid` / `void`).
2. `shipment.delayed` — `Shipment` with `props.status === "delayed"` OR (`expectedAt` < now AND status not `received` / `delivered`).
3. `po.late` — `PurchaseOrder` with `props.status === "late"` OR (`expectedAt` < now AND status not `received` / `cancelled`).
4. `payment.uncollected` — `Payment` with `props.status` in `sent`, `expired`, `failed`.
5. `stock.promise_risk` — for each `SalesOrder` with status `open`/`promised`: sum `ORDER_CONTAINS.qty` per SKU. Compare to `Stock.props.on_hand - reserved` plus inbound `Shipment` still open for that material/SKU. If promised qty > available + inbound, raise on the SalesOrder. Detail must name the SKU and the blocking PO/shipment if any.

- [ ] **Step 1: Tests first (mongodb-memory-server)**

`packages/graph` test script: `vitest run`. Use `MongoMemoryReplSet` or `MongoMemoryServer` from `mongodb-memory-server`. Cover at least:

```ts
it("upserts a node by key without duplicating", async () => { ... });

it("writeEdge supersedes the previous current edge", async () => {
  // two STOCK_OF writes; only one validTo=null; SUPERSEDES edge exists
});

it("neighborhood depth 2 from SO-218 reaches Meenakshi Brass after seed-shaped writes", async () => {
  // manually insert the beating-heart subgraph from spec §6.4, then neighborhood
});

it("path(SO-218, Meenakshi Brass) is non-null", async () => { ... });

it("impact(PO-104) includes SO-218 and Diya-Large stock", async () => { ... });

it("exceptions() returns overdue invoice and delayed shipment", async () => { ... });

it("TimeSlice before supersede returns the old qty", async () => { ... });
```

Run: `pnpm --filter @karya/graph test`  
Expected: FAIL (store not implemented).

- [ ] **Step 2: Implement `GraphStore` until tests pass**

Use the native driver (`Collection<NodeRecord>`). Do not add Mongoose. Zod-parse `props` only at the API boundary (Task 5), not inside the store.

Run: `pnpm --filter @karya/graph test`  
Expected: PASS.

---

### Task 4: Arka Atelier seed

**Files:**
- Create: `packages/seed/src/arka.ts`
- Test: `packages/seed/src/arka.test.ts`

**Interfaces:**
- Consumes: `GraphStore`
- Produces: `seedArkaAtelier(store: GraphStore): Promise<{ orgId: string; nodes: number; edges: number }>`

Org id: `org_arka`. Merchant key: `Org:Arka-Atelier`. Founder key: `Person:Anika`.

The seed must contain **at least** this beating-heart subgraph (spec §6.4), plus enough extra nodes that the index does not look like a toy (second SKU, workshop staff, courier org, one D2C order that is healthy).

Required nodes (keys are canonical — do not rename):

| key | type | important props |
|---|---|---|
| `Org:Arka-Atelier` | Org | `role=merchant`, `cashInPaise=42000000` (₹4.20L), `city=Jaipur` |
| `Person:Anika` | Person | `role=founder` |
| `Person:Rafi` | Person | `role=workshop` |
| `Org:Meenakshi-Brass` | Org | `role=vendor`, `verified_bank=true`, `city=Moradabad` |
| `Org:Lotus-Boutique` | Org | `role=customer`, `city=Mumbai` |
| `Org:Delhivery` | Org | `role=courier` |
| `Material:BrassSheet-22g` | Material | `uom=kg`, `reorder_point=15` |
| `SKU:Diya-Large` | SKU | `priceInPaise=185000`, `gst=12`, `lead_days=5` |
| `SKU:Tray-Oval` | SKU | `priceInPaise=240000` |
| `Location:Workshop` | Location | |
| `Stock:Diya-Large@Workshop` | Stock | `on_hand=12`, `reserved=9`, `incoming=40` (sheet, not finished) |
| `PurchaseOrder:PO-104` | PurchaseOrder | `status=late`, `expectedAt` four days ago, `qty=40` |
| `Shipment:IN-77` | Shipment | `direction=inbound`, `status=delayed`, `delay_days=4` |
| `SalesOrder:SO-218` | SalesOrder | `status=promised`, `promise_date=this Friday`, `qty=8` |
| `Invoice:INV-90` | Invoice | `status=overdue`, `amountInPaise=1480000`, `dueAt` 11 days ago |
| `Payment:plink_7` | Payment | `status=sent`, `channel=payment_link`, `amountInPaise=1480000` |
| `Lead:IG-Ananya` | Lead | `channel=instagram`, `status=open` |
| `Listing:Diya-Large-Instagram` | Listing | `channel=instagram`, `priceInPaise=185000` |
| `Meeting:VendorCall-Thu` | Meeting | `startsAt=Thursday 16:00 IST` |
| `Message:Vendor-Nudge` | Message | `channel=email`, `direction=out` |
| `Policy:pay.vendor` | Policy | `maxInPaise=2500000` |
| `Policy:collect.invoice` | Policy | `autonomy=true` |

Required edges (current, `validTo=null`):

- Anika `OWNS` Arka; Rafi `EMPLOYS`← Arka (Arka `EMPLOYS` Rafi)
- Meenakshi `SUPPLIES` BrassSheet-22g
- PO-104 `ORDER_CONTAINS` BrassSheet-22g `{ qty: 40, uom: "kg" }`
- IN-77 `FULFILLS` PO-104
- Diya-Large `MADE_FROM` BrassSheet-22g `{ qty: 0.35, uom: "kg" }`
- Stock `STOCK_OF` Diya-Large; Stock `LOCATED_AT` Workshop
- SO-218 `ORDER_CONTAINS` Diya-Large `{ qty: 8 }`
- Lotus `BUYS` SO-218
- INV-90 `INVOICES` SO-218
- plink_7 `PAYS` INV-90
- IG-Ananya `SOURCED_FROM` Listing; Listing `LISTS` Diya-Large
- VendorCall-Thu `ABOUT` PO-104
- Vendor-Nudge `ABOUT` PO-104

Also seed one **healthy** D2C `SalesOrder:SO-201` for Tray-Oval (paid, in packing) so exceptions are a subset, not the whole world.

`seedArkaAtelier` is idempotent: calling it twice does not duplicate keys (upsert by key; writeEdge supersedes).

- [ ] **Step 1: Tests**

```ts
it("creates the beating-heart path from SO-218 to Meenakshi Brass", async () => {
  await seedArkaAtelier(store);
  const so = await store.getNodeByKey("org_arka", "SalesOrder:SO-218");
  const vendor = await store.getNodeByKey("org_arka", "Org:Meenakshi-Brass");
  const p = await store.path("org_arka", so!._id, vendor!._id);
  expect(p).not.toBeNull();
});

it("exceptions include INV-90, IN-77, PO-104, plink_7, and SO-218 promise risk", async () => {
  await seedArkaAtelier(store);
  const ex = await store.exceptions("org_arka");
  const codes = ex.map((e) => e.code).sort();
  expect(codes).toEqual(expect.arrayContaining([
    "invoice.overdue", "shipment.delayed", "po.late",
    "payment.uncollected", "stock.promise_risk",
  ]));
});

it("is idempotent", async () => {
  const a = await seedArkaAtelier(store);
  const b = await seedArkaAtelier(store);
  expect(b.nodes).toBe(a.nodes);
});
```

Run: `pnpm --filter @karya/seed test`  
Expected: FAIL, then implement `arka.ts` until PASS.

Consequence copy for SO-218 must be in this spirit: “Lotus Boutique’s 8× Diya-Large promised Friday is blocked by late brass on PO-104.” Not “status=late”.

---

### Task 5: Fastify API

**Files:**
- Create: `apps/api/src/env.ts`, `mongo.ts`, `app.ts`, `index.ts`
- Create: `apps/api/src/routes/health.ts`, `graph.ts`, `seed.ts`

**Interfaces:**
- Consumes: `GraphStore`, `seedArkaAtelier`
- Produces: HTTP API below

Every request except `GET /health` requires header `x-org-id` (step 1 stand-in for auth). If missing, 400 `{ error: "x-org-id required" }`.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/health` | | `{ ok: true }` |
| POST | `/v1/admin/seed` | | `{ orgId, nodes, edges }` — refuse unless `NODE_ENV=development` |
| GET | `/v1/nodes` | `?type=` | `{ nodes }` |
| GET | `/v1/nodes/:key` | key URL-encoded | `{ node }` 404 if missing |
| GET | `/v1/neighborhood` | `?key=&depth=1\|2` | `{ center, nodes, edges }` |
| GET | `/v1/path` | `?from=&to=` keys | `{ nodes, edges } \| { path: null }` |
| GET | `/v1/impact` | `?key=` | `{ nodes, edges }` |
| GET | `/v1/exceptions` | | `{ exceptions }` |
| GET | `/v1/bootstrap` | | `{ org, exceptionCount, cashInPaise }` |

Register `@fastify/cors` for `WEB_ORIGIN`. `@fastify/sensible` optional. Logger: pino.

`env.ts` parses with Zod: `MONGO_URL`, `API_PORT`, `WEB_ORIGIN`, `NODE_ENV`.

- [ ] **Step 1: Health + seed route**

`apps/api` script `dev`: `tsx watch src/index.ts`. Script `test`: a vitest file that injects Fastify with memory Mongo, `POST /v1/admin/seed`, `GET /v1/exceptions` — expect ≥ 4 exceptions.

- [ ] **Step 2: Graph read routes**

404 for unknown keys. Never 500 on missing nodes.

- [ ] **Step 3: Manual check**

```
pnpm --filter @karya/api dev
curl -X POST http://localhost:4000/v1/admin/seed
curl -H "x-org-id: org_arka" http://localhost:4000/v1/exceptions
curl -H "x-org-id: org_arka" "http://localhost:4000/v1/path?from=SalesOrder:SO-218&to=Org:Meenakshi-Brass"
```

Expected: JSON path with several hops; exceptions include Lotus / PO-104 language.

---

### Task 6: Next.js shell that looks like Karya

**Files:**
- Create: `apps/web/src/app/layout.tsx`, `globals.css`, `page.tsx`
- Create: shell + inbox + node index components listed in File structure
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/next.config.ts`

**Interfaces:**
- Consumes: `/v1/bootstrap`, `/v1/exceptions`, `/v1/nodes`
- Produces: the three-pane console at `http://localhost:3000`

- [ ] **Step 1: App wiring**

`next.config.ts` rewrites:

```ts
async rewrites() {
  return [{ source: "/v1/:path*", destination: "http://127.0.0.1:4000/v1/:path*" }];
}
```

`layout.tsx`: `Newsreader`, `IBM_Plex_Sans`, `IBM_Plex_Mono` from `next/font/google`. Apply `tokenCss` plus:

```css
html, body { height: 100%; background: var(--ink); color: var(--text); font-family: var(--font-sans); font-size: 13px; }
* { box-sizing: border-box; }
```

No Tailwind color palette of our own — map Tailwind theme in `globals.css` `@theme` / `extend.colors` to the same CSS variables (`ink`, `copper`, etc.) so components do not hardcode hex.

`api.ts`:

```ts
export async function api<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { "x-org-id": "org_arka" }, cache: "no-store" });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json() as Promise<T>;
}
```

On first load, if exceptions are empty, `POST /v1/admin/seed` once (dev only) then refetch. Do not seed in a loop.

- [ ] **Step 2: Shell components**

`AppShell`: CSS grid

```
grid-template-columns: 56px 1fr 360px;
grid-template-rows: 1fr 32px;
height: 100vh;
```

`NavRail`: 8 icon buttons (Graph, Inbox, Orders, Inventory, Money, People, Calendar, Listings). Inbox is active. Inbox badge = exception count. Icons: 16px, 1.5 stroke, currentColor. Implement as inline SVG in `apps/web/src/components/shell/icons.tsx` — do not install an icon pack. Disabled destinations (everything except Inbox/Graph) are visible but `aria-disabled` with muted color; tooltip “Step 2”.

`AgentRail`: header “Governor” in Plex Sans 12px uppercase tracking, copper left border. Body: idle state, three lines max. Footer: “Approval cards appear here when money moves.” Do not fake a chat transcript.

`StatusStrip`: mono figures, muted labels, `tabular-nums`. Format cash as `₹4.20L` from `cashInPaise`.

`ExceptionList`: one row per exception. 3px left border risk/warn. Title + detail. Mono node key. Clicking a row is a no-op for navigation in this step except it sets a local `selectedKey` used by the index highlight.

`NodeIndex`: group nodes by type, type label muted, keys in mono. Highlight neighborhood of `SalesOrder:SO-218` if `/v1/neighborhood?key=SalesOrder:SO-218&depth=2` loaded — those keys in `signal` color. This is the graph, as an index, until XYFlow in step 2.

Copy must be written, not generated. No “Welcome to your dashboard.” No “Get started.”

- [ ] **Step 3: Visual check (required)**

Run `pnpm dev` (api + web). Open `http://localhost:3000`. Confirm:

1. Background is ink, not white or gray-50.
2. Wordmark *Karya* is italic Newsreader, nothing else is display serif.
3. Exception about Lotus / PO-104 is readable without opening a tooltip.
4. Node index includes `SKU:Diya-Large` and `Org:Meenakshi-Brass`.
5. Agent rail is not empty white.
6. At 1280×800 the three panes hold; nothing wraps into a stacked mobile marketing layout.
7. No third-party component library class names (`shadcn`, `rounded-xl shadow-lg`, `bg-gradient-to-r`).

If it looks like a Tailwind dashboard template, it is not done.

---

## Done when

- `pnpm --filter @karya/graph test` and `pnpm --filter @karya/seed test` pass.
- `POST /v1/admin/seed` then `GET /v1/path?from=SalesOrder:SO-218&to=Org:Meenakshi-Brass` returns a path.
- `GET /v1/exceptions` includes promise risk, delayed inbound, overdue invoice.
- Browser at `/` shows Karya chrome, exceptions, and the node index on seeded data.
- No Razorpay, no LLM, no AWS resources.

## Out of scope (step 2+)

XYFlow canvas, object inspectors, Auth.js, Razorpay, policy engine, agents, CDK.

---

## Self-review

- Spec §6 GraphStore + seed: Tasks 3–4.
- Spec §5 design scheme: Tasks 2 and 6.
- Spec §10 stack (Next, Fastify, Mongo, TS): Tasks 1 and 5.
- Spec §14 item 1 only. Canvas, Razorpay, agents not claimed.
- AWS named as target, not implemented — matches “don’t deploy empty graph.”
- Types: `GraphStore`, `NodeRecord`, `EdgeRecord`, `Exception` used consistently.
- No TBD / “add validation later.”
