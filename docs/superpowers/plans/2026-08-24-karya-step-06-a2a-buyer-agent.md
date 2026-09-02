# Karya Step 6 — `/a2a` Catalog, Checkout & Buyer Agent Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the merchant-side agent-to-agent commerce protocol at `/a2a/*` (ACP-inspired, honest subset), wire checkout to real Razorpay test-mode Payment Links + graph writes (SalesOrder, stock reservation, audit Events), and add a **Buyer Agent** canvas view that runs a scripted demo query with a visible HTTP request/response log — proving Arka Atelier is sellable to an external AI buyer.

**Architecture:** New `packages/a2a` builds catalog and checkout logic from `GraphStore`. Ephemeral checkout sessions live in Mongo `a2a_sessions` (like `approvals`). Fastify registers **public** `/a2a/*` routes outside the `x-org-id` hook; merchant org is resolved from `A2A_ORG_ID` env (default `org_arka`). Complete checkout reuses `@karya/razorpay` `createPaymentLink` and `apps/api/src/services/audit.ts`. Web Buyer Agent panel calls `/a2a/*` without auth headers via a dedicated client + Next.js rewrite.

**Tech Stack:** TypeScript 5.8 strict, Fastify 5, MongoDB native driver, Zod 3, Vitest + `mongodb-memory-server`, existing `@karya/graph`, `@karya/razorpay`, `@karya/tokens`, Step 2 console routing.

## Global Constraints

From spec §8.2, §9.3, §11 step 4 and Steps 1–5.

- **Route paths are locked** (spec §9.3). Do not rename `/a2a/catalog`, `/a2a/checkout/sessions`, `/a2a/checkout/sessions/:id/complete`, `/a2a/orders/:id`.
- **`/a2a/*` is PUBLIC.** No `x-org-id` header. Single-merchant MVP resolves org from `A2A_ORG_ID` env. Never expose other orgs’ data.
- **Do not fake inbound money.** `complete` calls real Razorpay test API when keys configured; otherwise 503 `{ error: "razorpay_not_configured" }`.
- **Idempotency on Razorpay POST.** Reuse `idempotencyKey(orgId, "a2a_checkout", sessionId)` from `@karya/razorpay`.
- **Graph is system of record** for catalog (SKU + Stock), SalesOrder, Payment, stock `reserved`, and audit (`Event` nodes via `writeAuditEvent`).
- **Stock reservation = increment `Stock.props.reserved`** on the Stock node linked via `STOCK_OF` to the SKU. Validate `on_hand - reserved >= qty` before reserving.
- **Honesty:** README and UI copy say “ACP-inspired subset,” not certified ACP/UAP.
- **Buyer Agent is NOT an LLM.** Scripted state machine only. Every HTTP call is visible in the log.
- **No Governor tool loop** in this step. Buyer Agent is a separate canvas view, not the AgentRail Governor.
- UI tokens unchanged. No shadcn, no icon packs, no purple gradients.
- `simulate-webhook` is **development only** (`NODE_ENV=development`).

---

## File structure (this step creates / modifies)

```
.env.example                                         A2A_ORG_ID
apps/api/package.json                                add @karya/a2a
apps/api/src/env.ts                                  A2A_ORG_ID (modify)
apps/api/src/mongo.ts                                a2a_sessions indexes (modify)
apps/api/src/app.ts                                  register /a2a + simulate-webhook (modify)
apps/api/src/routes/a2a.ts
apps/api/src/routes/simulate-webhook.ts
apps/api/src/services/a2a-checkout.ts                orchestration (Payment Link + graph)
apps/api/src/services/a2a-sessions.ts                Mongo CRUD
apps/api/src/test/a2a.test.ts
apps/api/src/test/simulate-webhook.test.ts
apps/api/src/routes/webhooks.ts                      SalesOrder paid path for A2A (modify)
packages/a2a/package.json
packages/a2a/tsconfig.json
packages/a2a/src/index.ts
packages/a2a/src/types.ts
packages/a2a/src/catalog.ts
packages/a2a/src/checkout.ts
packages/a2a/src/stock.ts
packages/a2a/src/catalog.test.ts
packages/a2a/src/checkout.test.ts
packages/seed/src/arka.ts                            image_urls_json on Diya-Large (modify)
apps/web/next.config.ts                            rewrite /a2a/* (modify)
apps/web/src/lib/api.ts                              ConsoleView + types (modify)
apps/web/src/lib/a2a-client.ts                       public fetch, no x-org-id
apps/web/src/lib/buyer-agent-script.ts               scripted demo flow
apps/web/src/components/Console.tsx                  buyer view route (modify)
apps/web/src/components/shell/NavRail.tsx            enable Listings → Buyer (modify)
apps/web/src/components/shell/icons.tsx              label tweak (modify)
apps/web/src/components/buyer/BuyerAgentPanel.tsx
apps/web/src/components/buyer/BuyerAgentChat.tsx
apps/web/src/components/buyer/HttpRequestLog.tsx
apps/web/src/components/buyer/BuyerAgentPanel.test.tsx
```

No `packages/agents` changes. No Auth.js. No LLM SDK.

---

## Environment variables (lock these names)

Add to `.env.example`:

```
# Merchant org exposed via public /a2a/* (single-tenant MVP)
A2A_ORG_ID=org_arka
```

`apps/api/src/env.ts`:

```ts
const envSchema = z.object({
  // ... existing ...
  A2A_ORG_ID: z.string().default("org_arka"),
});
```

---

## API routes (locked shapes)

All `/a2a/*` responses are JSON. Errors: `{ error: string, detail?: string }`.

| Method | Path | Auth | Body / params | Response |
|---|---|---|---|---|
| GET | `/a2a/catalog` | none | | `{ merchant, items, generatedAt }` |
| POST | `/a2a/checkout/sessions` | none | `{ lineItems, buyer?, fulfillment? }` | `{ session }` |
| POST | `/a2a/checkout/sessions/:id/complete` | none | optional `{ idempotencyKey? }` | `{ session, order, payment }` |
| GET | `/a2a/orders/:id` | none | `:id` = session id `cs_*` **or** order key `SalesOrder:SO-A2A-*` | `{ order }` |
| POST | `/v1/admin/simulate-webhook` | `x-org-id` | `{ event, paymentLinkId }` | `{ received: true, dispatched: event }` |

`POST /v1/admin/simulate-webhook` refuses unless `NODE_ENV=development`. Valid `event`: `"payment_link.paid"` | `"payment_link.expired"`.

---

## Type definitions (locked)

### `packages/a2a/src/types.ts`

```ts
export type CatalogMerchant = {
  name: string;
  orgId: string;
  city?: string;
};

export type CatalogItem = {
  skuKey: string;           // graph key, e.g. "SKU:Diya-Large"
  name: string;             // SKU label
  description?: string;
  priceInPaise: number;     // unit price ex-GST display basis (from SKU.props.priceInPaise)
  currency: "INR";
  gstRatePercent: number;   // SKU.props.gst, default 0
  availableQty: number;     // sum(on_hand - reserved) across Stock nodes STOCK_OF this SKU
  leadDays: number;         // SKU.props.lead_days, default 7
  images: string[];         // parsed from SKU.props.image_urls_json or linked Document.props.url
  inStock: boolean;         // availableQty > 0
  canShipBy: string;        // ISO date: today + leadDays calendar days (MVP simplification)
};

export type CatalogResponse = {
  merchant: CatalogMerchant;
  items: CatalogItem[];
  generatedAt: string;      // ISO
};

export type CheckoutLineItem = {
  skuKey: string;
  quantity: number;           // positive integer
};

export type CheckoutBuyer = {
  name?: string;
  email?: string;
  agentId?: string;           // e.g. "buyer-demo-uap"
};

export type CheckoutFulfillment = {
  type: "ship";
  preferredBy?: string;       // ISO date from buyer agent
};

export type CreateCheckoutSessionRequest = {
  lineItems: CheckoutLineItem[];
  buyer?: CheckoutBuyer;
  fulfillment?: CheckoutFulfillment;
};

export type CheckoutTotals = {
  subtotalInPaise: number;    // sum(unitPrice * qty)
  gstInPaise: number;         // sum(unitPrice * qty * gstRate / 100), rounded per line
  totalInPaise: number;
};

export type CheckoutSessionFulfillment = {
  type: "ship";
  estimatedShipDate: string;  // ISO
  leadDaysMax: number;
};

export type CheckoutSessionStatus =
  | "pending"
  | "completed"
  | "expired"
  | "cancelled";

export type CheckoutSession = {
  id: string;                 // cs_{ulid}
  status: CheckoutSessionStatus;
  lineItems: CheckoutLineItem[];
  totals: CheckoutTotals;
  fulfillment: CheckoutSessionFulfillment;
  buyer?: CheckoutBuyer;
  createdAt: string;
  expiresAt: string;          // createdAt + 30 minutes
  completedAt?: string;
  salesOrderKey?: string;     // set on complete
  paymentLinkId?: string;
};

export type CreateCheckoutSessionResponse = {
  session: CheckoutSession;
};

export type CompleteCheckoutSessionResponse = {
  session: CheckoutSession;
  order: {
    id: string;               // graph node _id
    orderKey: string;         // SalesOrder:SO-A2A-{short}
    status: "pending_payment";
  };
  payment: {
    paymentLinkId: string;
    shortUrl: string;
    status: "created";
  };
};

export type A2AOrderStatus =
  | "pending_payment"
  | "paid"
  | "expired"
  | "cancelled";

export type A2AOrderResponse = {
  order: {
    id: string;               // session id or sales order node id
    orderKey?: string;
    sessionId: string;
    status: A2AOrderStatus;
    lineItems: CheckoutLineItem[];
    totals: CheckoutTotals;
    payment?: {
      paymentLinkId: string;
      shortUrl: string;
      status: string;
    };
    salesOrderKey?: string;
    createdAt: string;
    updatedAt: string;
  };
};
```

### Mongo `a2a_sessions` document (locked)

```ts
export type A2ASessionDocument = {
  _id: string;                // same as CheckoutSession.id
  orgId: string;
  status: CheckoutSessionStatus;
  lineItems: CheckoutLineItem[];
  totals: CheckoutTotals;
  fulfillment: CheckoutSessionFulfillment;
  buyer?: CheckoutBuyer;
  createdAt: Date;
  expiresAt: Date;
  completedAt?: Date;
  salesOrderId?: string;
  salesOrderKey?: string;
  paymentNodeId?: string;
  paymentLinkId?: string;
  idempotencyKey?: string;
};
```

Index: `{ orgId: 1, createdAt: -1 }`, TTL optional — not required for MVP (sessions are small).

---

## Catalog building rules (locked)

`buildCatalog(store, orgId): Promise<CatalogResponse>` in `packages/a2a/src/catalog.ts`:

1. Load merchant `Org` where `props.role === "merchant"` (first match) OR key `Org:Arka-Atelier`.
2. List all `SKU` nodes for org.
3. For each SKU:
   - Find `Stock` nodes via incoming `STOCK_OF` edges (`Stock → SKU`).
   - `availableQty = sum(stock.on_hand - stock.reserved)` (treat missing as 0).
   - `leadDays = Number(sku.props.lead_days ?? 7)`.
   - `canShipBy = addCalendarDays(new Date(), leadDays).toISOString()`.
   - `images`: if `sku.props.image_urls_json` is string, `JSON.parse` → `string[]`; else `[]`.
   - Include SKU in catalog even if `availableQty === 0` (`inStock: false`) — buyer agent can see out-of-stock honestly.
4. Sort items by `skuKey` ascending.
5. `generatedAt = new Date().toISOString()`.

**Demo anchor:** `SKU:Diya-Large` — ₹1,850 (`185000` paise), GST 12%, available 3 (12 on hand − 9 reserved), `lead_days: 5`. `SKU:Tray-Oval` — ₹2,400, available 20 — over demo budget.

---

## Checkout lifecycle (locked)

### `POST /a2a/checkout/sessions`

1. Validate `lineItems.length >= 1`. Each: `skuKey` exists, `quantity` is positive integer.
2. Resolve each line against catalog; 400 `{ error: "sku_not_found" }` or `{ error: "insufficient_stock", skuKey }` if `quantity > availableQty`.
3. Compute totals per line:
   - `lineSubtotal = priceInPaise * quantity`
   - `lineGst = Math.round(lineSubtotal * gstRatePercent / 100)`
   - Accumulate into `CheckoutTotals`.
4. `leadDaysMax = max(sku.leadDays)` across lines.
   - `estimatedShipDate = addCalendarDays(now, leadDaysMax)`.
5. Insert `A2ASessionDocument` with `status: "pending"`, `expiresAt = now + 30min`.
6. `writeAuditEvent` — `a2a.checkout.session_created`, `actor: "a2a:buyer"`, `sideEffectClass: "write"`, payload `{ sessionId, lineItems, totals }`.
7. Return `{ session }` (ISO-string dates).

### `POST /a2a/checkout/sessions/:id/complete`

1. Load session by `_id`. 404 if missing.
2. 409 if `status !== "pending"`. 410 if `expiresAt < now` → set status `expired` and return `{ error: "session_expired" }`.
3. Re-validate stock (race-safe). 409 `{ error: "insufficient_stock", skuKey }` if no longer available.
4. **Graph writes (single merchant org):**
   - Allocate order key: `SalesOrder:SO-A2A-{ulid slice 8}`.
   - Upsert `SalesOrder` node: `status: "pending_payment"`, `channel: "a2a"`, `session_id`, props `totalInPaise`, `promise_date` = `estimatedShipDate` from session.
   - For each line: `writeEdge` `ORDER_CONTAINS` from SalesOrder → SKU `{ qty, uom: "ea" }`.
   - Upsert buyer org if needed: `Org:AI-Buyer` label from `buyer.name ?? "AI Buyer Agent"`, `role: "customer"`, `source: "a2a"`. `writeEdge` `BUYS` from buyer Org → SalesOrder.
   - **Reserve stock:** for each line, find primary Stock node (`Stock:{skuKey suffix}@Workshop` or first `STOCK_OF` target), upsert `reserved += quantity`.
   - If `!razorpayConfigured(env)` → 503.
   - `idempotencyKey = input.idempotencyKey ?? idempotencyKey(orgId, "a2a_checkout", sessionId)`.
   - Call `createPaymentLink(client, { amountInPaise: totals.totalInPaise, description: "A2A order {orderKey}", customer: { name, email }, notes: { org_id, checkout_session_id: sessionId, sales_order_key: orderKey } }, idempotencyKey)`.
   - Upsert `Payment` node: `Payment:{razorpay.id}`, props `status: sent`, `channel: payment_link`, `razorpay_payment_link_id`, `short_url`, `idempotency_key`, `checkout_session_id`.
   - `writeEdge` `PAYS` Payment → SalesOrder (not Invoice — D2C agent path).
   - Update session doc: `status: "completed"`, `completedAt`, `salesOrderKey`, `paymentLinkId`, `salesOrderId`, `paymentNodeId`, `idempotencyKey`.
   - `writeAuditEvent` — `a2a.checkout.completed` + `payment_link.created`, `sideEffectClass: "money"`, `aboutNodeIds: [salesOrder, payment, ...stock nodes]`.
5. Return `CompleteCheckoutSessionResponse`.

**Idempotent complete:** If session already `completed` and `paymentLinkId` set, return same `{ session, order, payment }` without double-reserving stock or second Razorpay call.

### `GET /a2a/orders/:id`

- If `id` starts with `cs_`: load session → map to `A2AOrderResponse`.
- If `id` starts with `SalesOrder:` or matches order key: load SalesOrder node + linked Payment via `PAYS` edge.
- Map payment status: Payment `captured`/`paid` → order `paid`; Payment `expired` → order `expired`; else `pending_payment`.
- 404 if not found.

---

## Webhook extension for A2A orders (modify Step 3 handler)

In `apps/api/src/routes/webhooks.ts`, after `handlePaymentLinkPaid`:

- If no linked Invoice, check `PAYS` edge to `SalesOrder` node.
- On paid: upsert SalesOrder `props.status = "paid"` (or `"open"`).
- On expired: SalesOrder stays `pending_payment`; optionally write `Event` `a2a.payment.expired` with `aboutNodeIds` [SalesOrder, Payment].
- **Do not** release stock automatically on expire in Step 6 — Step 7 failure loop handles release/hold proposals.

Payment notes from A2A complete must include `checkout_session_id` and `sales_order_key` for traceability.

---

## Buyer Agent UI (locked)

### Nav decision

Enable the disabled **Listings** nav slot as **Buyer Agent** (`id: "listings"`, label `"Buyer"`, tooltip `"Buyer Agent"`). Maps to `ConsoleView: "buyer"`. Listings generator remains Step 9 — this slot is repurposed for the demo.

### `ConsoleView` extension

```ts
export type ConsoleView =
  | "inbox"
  | "graph"
  | "orders"
  | "inventory"
  | "policy"
  | "buyer";
```

### Component props (locked)

```tsx
// BuyerAgentPanel.tsx
export type BuyerAgentPanelProps = {
  onOrderPlaced?: (orderKey: string) => void;
};

// BuyerAgentChat.tsx
export type BuyerAgentMessage = {
  id: string;
  role: "buyer" | "system";
  text: string;
  at: string;
};

export type BuyerAgentChatProps = {
  messages: BuyerAgentMessage[];
  running: boolean;
  onRunDemo: () => void;
};

// HttpRequestLog.tsx
export type HttpLogEntry = {
  id: string;
  method: string;
  url: string;
  requestBody?: unknown;
  status: number;
  responseBody: unknown;
  durationMs: number;
  at: string;
};

export type HttpRequestLogProps = {
  entries: HttpLogEntry[];
};
```

### Layout

- Canvas header when `view === "buyer"`: title **Buyer Agent**, subtitle muted `"External AI shopper · public /a2a/*"`.
- Body: CSS grid `grid-cols-2`, min-height 0.
  - Left: `BuyerAgentChat` — copper left border on buyer messages, mono timestamps, primary button **Run demo query** (verb, not “Start”).
  - Right: `HttpRequestLog` — stacked entries, method + path in mono, status color (`teal` 2xx, `risk` 4xx/5xx), collapsible JSON (`<pre>` Plex Mono 11px).
- Default demo query (hardcoded in `buyer-agent-script.ts`):

```ts
export const DEMO_BUYER_QUERY =
  "Find a large brass diya under ₹2,000 that can ship this week.";
```

### Scripted flow (`buyer-agent-script.ts`)

State machine `runBuyerDemo(log: (entry) => void): Promise<{ orderKey: string }>`:

| Step | Action | Notes |
|---|---|---|
| 1 | Push buyer chat message | DEMO_BUYER_QUERY |
| 2 | `GET /a2a/catalog` | Log request/response |
| 3 | Push system message | `"Filtering: price ≤ ₹2,000, in stock, ship within 7 days."` |
| 4 | Select `SKU:Diya-Large`, qty `1` client-side | If not found, throw visible error |
| 5 | `POST /a2a/checkout/sessions` | body below |
| 6 | Push system message | `"Checkout session created. Completing with Razorpay test link…"` |
| 7 | `POST /a2a/checkout/sessions/{id}/complete` | |
| 8 | Push system message | Include `shortUrl` in mono |
| 9 | Return `{ orderKey }` | Caller calls `onOrderPlaced` → `focusNode(orderKey)` + `reload()` |

Session create body:

```json
{
  "lineItems": [{ "skuKey": "SKU:Diya-Large", "quantity": 1 }],
  "buyer": {
    "name": "Demo UAP Buyer",
    "email": "buyer@agent.example",
    "agentId": "karya-demo-buyer"
  },
  "fulfillment": { "type": "ship", "preferredBy": "<ISO end of this week>" }
}
```

### `apps/web/src/lib/a2a-client.ts`

```ts
export async function a2aGet<T>(path: string): Promise<{ data: T; status: number; durationMs: number }>;
export async function a2aPost<T>(path: string, body: unknown): Promise<{ data: T; status: number; durationMs: number }>;
```

No `x-org-id` header. Base path `/a2a/...` (rewritten to API).

### `next.config.ts` rewrite (add)

```ts
{ source: "/a2a/:path*", destination: "http://127.0.0.1:4000/a2a/:path*" },
```

---

## Seed modification (minimal)

In `packages/seed/src/arka.ts`, add to `SKU:Diya-Large` props:

```ts
image_urls_json: JSON.stringify([
  "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=400",
]),
description: "Large hand-hammered brass diya, 22g sheet, Jaipur workshop.",
```

Do not change existing SO-218 reserved counts — demo buyer orders qty 1 from remaining available 3.

---

### Task 1: `packages/a2a` scaffold

**Files:**
- Create: `packages/a2a/package.json`, `tsconfig.json`, `src/index.ts`

**Interfaces:**
- Produces: `@karya/a2a` workspace package

```json
{
  "name": "@karya/a2a",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@karya/graph": "workspace:*",
    "zod": "^3.24.4"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "vitest": "^3.1.3",
    "mongodb-memory-server": "^10.1.4"
  }
}
```

Add `"@karya/a2a": "workspace:*"` to `apps/api/package.json`.

- [ ] **Step 1: Create package and export surface**

`src/index.ts` re-exports `types`, `buildCatalog`, `computeTotals`, `validateLineItems`, `addCalendarDays`.

---

### Task 2: Types + catalog

**Files:**
- Create: `packages/a2a/src/types.ts`
- Create: `packages/a2a/src/catalog.ts`
- Test: `packages/a2a/src/catalog.test.ts`

**Interfaces:**
- Consumes: `GraphStore`
- Produces: `buildCatalog(store, orgId): Promise<CatalogResponse>`

- [ ] **Step 1: Tests first**

Seed-shaped graph in memory: Diya-Large + Stock 12/9, Tray-Oval + Stock 20/0.

```ts
it("catalog lists Diya-Large with availableQty 3 and gst 12", async () => { ... });
it("catalog marks Tray-Oval inStock true but price above demo budget", async () => { ... });
it("canShipBy is today + lead_days", async () => { ... });
```

Run: `pnpm --filter @karya/a2a test` — Expected: FAIL.

- [ ] **Step 2: Implement `buildCatalog` until PASS**

---

### Task 3: Checkout pure functions

**Files:**
- Create: `packages/a2a/src/checkout.ts`
- Create: `packages/a2a/src/stock.ts`
- Test: `packages/a2a/src/checkout.test.ts`

**Interfaces:**

```ts
export function computeTotals(
  lines: CheckoutLineItem[],
  catalogItems: CatalogItem[],
): CheckoutTotals;

export function validateLineItems(
  lines: CheckoutLineItem[],
  catalogItems: CatalogItem[],
): { ok: true } | { ok: false; error: "sku_not_found" | "insufficient_stock"; skuKey?: string };

export async function findStockForSku(
  store: GraphStore,
  orgId: string,
  skuId: string,
): Promise<NodeRecord | null>;

export function computeFulfillment(
  lines: CheckoutLineItem[],
  catalogItems: CatalogItem[],
): CheckoutSessionFulfillment;
```

- [ ] **Step 1: Tests for totals**

Diya-Large qty 1: subtotal `185000`, gst `22200`, total `207200`.

- [ ] **Step 2: Tests for stock validation**

Request qty 4 when available 3 → `insufficient_stock`.

Run: `pnpm --filter @karya/a2a test` — Expected: PASS.

---

### Task 4: Mongo session store

**Files:**
- Create: `apps/api/src/services/a2a-sessions.ts`
- Modify: `apps/api/src/mongo.ts`

**Interfaces:**

```ts
export async function ensureA2AIndexes(db: Db): Promise<void>;
export async function insertSession(db: Db, doc: A2ASessionDocument): Promise<void>;
export async function getSession(db: Db, id: string): Promise<A2ASessionDocument | null>;
export async function updateSession(
  db: Db,
  id: string,
  patch: Partial<A2ASessionDocument>,
): Promise<A2ASessionDocument | null>;
```

Call `ensureA2AIndexes` from `connectMongo`.

- [ ] **Step 1: Implement CRUD with typed documents**

- [ ] **Step 2: Unit test insert + get + update**

---

### Task 5: Checkout orchestration service

**Files:**
- Create: `apps/api/src/services/a2a-checkout.ts`

**Interfaces:**

```ts
export type A2ACheckoutDeps = {
  store: GraphStore;
  db: Db;
  env: Env;
  razorpayClient?: RazorpayClient;
  audit: typeof writeAuditEvent;
};

export async function createCheckoutSession(
  deps: A2ACheckoutDeps,
  orgId: string,
  input: CreateCheckoutSessionRequest,
): Promise<CheckoutSession>;

export async function completeCheckoutSession(
  deps: A2ACheckoutDeps,
  orgId: string,
  sessionId: string,
  input?: { idempotencyKey?: string },
): Promise<CompleteCheckoutSessionResponse>;

export async function getA2AOrder(
  deps: A2ACheckoutDeps,
  orgId: string,
  id: string,
): Promise<A2AOrderResponse>;
```

Implement stock reservation via:

```ts
await store.upsertNode({
  ...stockNode,
  props: {
    ...stockNode.props,
    reserved: Number(stockNode.props.reserved ?? 0) + quantity,
  },
});
```

Extract shared payment-link creation pattern from `payment-links.ts` if useful, but do **not** require an Invoice — A2A path creates Payment → SalesOrder directly.

- [ ] **Step 1: Integration test with memory Mongo + mock Razorpay fetch**

Complete flow → SalesOrder node exists, Stock reserved +1, Payment node with `short_url`, audit Events ≥ 2.

- [ ] **Step 2: Idempotent complete test**

Second complete call returns same payment link id, reserved count unchanged.

---

### Task 6: Fastify `/a2a` routes

**Files:**
- Create: `apps/api/src/routes/a2a.ts`
- Modify: `apps/api/src/app.ts`

Register **outside** the `x-org-id` scoped plugin:

```ts
await app.register(a2aRoutes, { env, store, db });
```

Route handlers resolve `const orgId = env.A2A_ORG_ID`.

Zod-parse request bodies at boundary.

| Status | Condition |
|---|---|
| 400 | validation / sku_not_found |
| 409 | insufficient_stock / session not pending |
| 410 | session_expired |
| 503 | razorpay_not_configured on complete |

- [ ] **Step 1: Wire four routes**

- [ ] **Step 2: `apps/api/src/test/a2a.test.ts`**

Inject Fastify, seed graph, mock Razorpay:

```ts
it("GET /a2a/catalog returns Diya-Large under ₹2000 with availability", async () => { ... });
it("POST checkout session + complete creates SalesOrder and reserves stock", async () => { ... });
it("GET /a2a/orders/:sessionId returns pending_payment", async () => { ... });
it("/a2a routes do not require x-org-id", async () => { ... });
```

---

### Task 7: Simulate webhook dev tool

**Files:**
- Create: `apps/api/src/routes/simulate-webhook.ts`
- Modify: `apps/api/src/app.ts` (inside scoped plugin — requires `x-org-id`)
- Modify: `apps/api/src/routes/webhooks.ts` (export dispatch helpers OR duplicate minimal payload builder)

**Interfaces:**

```ts
// POST /v1/admin/simulate-webhook
type SimulateWebhookBody = {
  event: "payment_link.paid" | "payment_link.expired";
  paymentLinkId: string;
};

// Builds RazorpayWebhookPayload-shaped object and calls same handlers as POST /v1/webhooks/razorpay
// Skips signature verification — dev only
```

- [ ] **Step 1: Refactor webhook handlers to export `dispatchRazorpayWebhook(store, payload)`**

- [ ] **Step 2: simulate route calls dispatch**

- [ ] **Step 3: Test paid simulation updates A2A SalesOrder to paid**

Run: `pnpm --filter @karya/api test`

---

### Task 8: Seed image prop

**Files:**
- Modify: `packages/seed/src/arka.ts`
- Modify: `packages/seed/src/arka.test.ts`

- [ ] **Step 1: Add `image_urls_json` and `description` to Diya-Large**

- [ ] **Step 2: Assert catalog test or seed test sees parseable images**

---

### Task 9: Web rewrites + a2a client

**Files:**
- Modify: `apps/web/next.config.ts`
- Create: `apps/web/src/lib/a2a-client.ts`

- [ ] **Step 1: Add `/a2a/*` rewrite alongside existing `/v1/*`**

- [ ] **Step 2: Implement `a2aGet` / `a2aPost` with timing**

---

### Task 10: Buyer Agent panel UI

**Files:**
- Create: `apps/web/src/components/buyer/BuyerAgentPanel.tsx`
- Create: `apps/web/src/components/buyer/BuyerAgentChat.tsx`
- Create: `apps/web/src/components/buyer/HttpRequestLog.tsx`
- Create: `apps/web/src/lib/buyer-agent-script.ts`
- Modify: `apps/web/src/lib/api.ts` (`ConsoleView`)
- Modify: `apps/web/src/components/Console.tsx`
- Modify: `apps/web/src/components/shell/NavRail.tsx`
- Modify: `apps/web/src/components/shell/icons.tsx` (Listings entry `enabled: true`, label `"Buyer"`)
- Test: `apps/web/src/components/buyer/BuyerAgentPanel.test.tsx`

**Design bar:**

- Chat well: `surface-2` background. Buyer messages: 2px `copper` left border. System messages: muted, no border.
- HTTP log: each entry is a `surface` row, hairline `line` border-bottom. Method badge mono. JSON syntax plain — no third-party highlighter.
- **Run demo query** button: copper text on transparent, border `line`, hover `text`.
- While running: button disabled, label `"Running…"`.
- On success: system message `"SalesOrder {key} created. Switch to Graph to see it live."` with clickable key calling `focusNode`.

- [ ] **Step 1: Component tests**

Render panel, mock `a2aGet`/`a2aPost`, run demo, assert 3 log entries (catalog, session, complete).

- [ ] **Step 2: Wire Console view + nav**

`CanvasBody` case `"buyer": return <BuyerAgentPanel onOrderPlaced={(key) => { focusNode(key); void reload(); }} />`

- [ ] **Step 3: Visual check**

Run `pnpm dev`. Buyer nav → Run demo → log shows four HTTP calls → Graph shows new `SalesOrder:SO-A2A-*` after reload and focus.

---

### Task 11: End-to-end demo script (manual)

Document for the engineer (and pitch video operator):

1. Seed fresh: `POST /v1/admin/seed`.
2. Open Buyer Agent view. Click **Run demo query**.
3. Confirm HTTP log: `GET /a2a/catalog` → `POST .../sessions` → `POST .../complete`.
4. Open Graph — new SalesOrder chevron, Payment teal disc, Stock `reserved` incremented on Diya-Large.
5. Optional: `POST /v1/admin/simulate-webhook` with `{ "event": "payment_link.paid", "paymentLinkId": "<id from log>" }` → order status `paid`.
6. Narration line (spec §11.4): *"AI buyer arrives… merchant is sellable to an AI buyer."*

---

## Done when

- `pnpm --filter @karya/a2a test` and `pnpm --filter @karya/api test` pass.
- `GET /a2a/catalog` returns real SKU/stock/GST data from graph without `x-org-id`.
- Full checkout creates Razorpay test Payment Link (when keys set), `SalesOrder`, stock reservation, and audit Events.
- `GET /a2a/orders/:id` reflects payment status after webhook or simulate-webhook.
- Buyer Agent panel runs scripted demo with visible request/response log.
- Graph canvas shows new SalesOrder in real time after demo (`reload()` + focus).
- `POST /v1/admin/simulate-webhook` works in development for `payment_link.paid` / `payment_link.expired`.
- No LLM calls. No fake Razorpay success when keys absent.

## Out of scope (step 7+)

Money agent, collections loop, forced failure UX (Inbox proposals), stock release on expire, policy evaluation on A2A checkout, real UAP/ACP certification, Auth.js, multi-merchant `/a2a`, Razorpay Orders API (non-link), audit explorer UI, Listings generator, Governor tool traces for buyer flow.

---

## Self-review

- Spec §8.2 Sell side — agent-readable catalog + checkout + stock reservation.
- Spec §9.3 — four route paths and shapes locked exactly.
- Spec §11.4 demo narrative — scripted buyer query, `/a2a/*`, Payment Link, SalesOrder on graph.
- Spec §9.1 — Payment Links primary collect path; test mode only.
- Reuses Step 3 `createPaymentLink`, idempotency, webhook handlers, `writeAuditEvent`.
- Reuses Step 2 console view routing; AgentRail unchanged (Governor stays merchant-side).
- Graph types unchanged — no new node types; sessions in Mongo not graph.
- Public vs authenticated routes clearly separated in `app.ts`.
- No TBD on API shapes, types, or demo script steps.
