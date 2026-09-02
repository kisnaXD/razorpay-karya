# Karya Step 3 — Razorpay Adapter & Audit Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Razorpay test-mode for Payment Links (primary collect path), verify and ingest webhooks, record an append-only audit trail as `Event` nodes in the graph, and expose `POST /v1/payment-links` and `GET /v1/audit`. Ship a `PayoutAdapter` interface with `LedgerPayoutProvider` (default) and optional `RazorpayXProvider` — infrastructure only; no Money agent yet.

**Architecture:** New `packages/razorpay` wraps the Razorpay REST API with idempotency keys and typed responses. `apps/api` registers webhook + payment-link routes; all side effects write through `GraphStore` (Payment nodes, Event audit nodes, prop updates). Payouts go through an adapter interface so Step 7 can swap providers without UI changes.

**Tech Stack:** TypeScript 5.8 strict, Fastify 5 (raw body for webhooks), native `fetch` to Razorpay API (no official SDK — keeps bundle small), `crypto` for HMAC webhook verification, Vitest + `mongodb-memory-server`, existing `@karya/graph`.

## Global Constraints

Inherited from spec §8.5, §9, and Steps 1–2.

- **Test mode only.** Never claim live/production payments. README must say test keys.
- **Do not fake inbound money.** Payment Links call real Razorpay test API when keys are set. When keys are missing in development, return 503 with clear error — do not silently mock success.
- **Idempotency keys on every Razorpay POST.** Format: `karya_{orgId}_{action}_{stableRef}` stored in Payment/Event props; replay returns the same graph node.
- **Audit = `Event` nodes** in the graph with `props.event_type`, `props.actor`, `props.side_effect_class`, serialized payload. No parallel audit SQL table.
- **Webhook signature verification required** before any graph mutation. Invalid signature → 401, no writes.
- **Graph is system of record.** Razorpay IDs live in node `props` (`razorpay_payment_link_id`, `razorpay_payment_id`, etc.).
- Deletes are rare — payment state changes supersede props via node upsert + new Event, not node deletion.
- No agents, no policy engine evaluation, no approval cards in this step (Money nav stays disabled).
- `orgId` on every document. Single org: `org_arka`.
- Step 2 UI unchanged except: Money nav tooltip becomes “Step 4” for policy; optional read-only audit link in status strip is out of scope — audit is API-only this step.

---

## File structure (this step creates / modifies)

```
.env.example                                         Razorpay env vars
apps/api/package.json                                add @karya/razorpay
apps/api/src/env.ts                                  Razorpay + payout env (modify)
apps/api/src/app.ts                                  register new routes (modify)
apps/api/src/routes/payment-links.ts
apps/api/src/routes/webhooks.ts
apps/api/src/routes/audit.ts
apps/api/src/services/audit.ts                       Event node writers
apps/api/src/services/payment-links.ts               orchestration
apps/api/src/services/payout.ts                      adapter wiring
apps/api/src/test/payment-links.test.ts
apps/api/src/test/webhooks.test.ts
packages/razorpay/package.json
packages/razorpay/tsconfig.json
packages/razorpay/src/index.ts
packages/razorpay/src/types.ts
packages/razorpay/src/client.ts                      Razorpay REST client
packages/razorpay/src/idempotency.ts
packages/razorpay/src/payment-links.ts
packages/razorpay/src/webhooks.ts                    verifySignature
packages/razorpay/src/payout.ts                      PayoutAdapter + providers
packages/razorpay/src/payment-links.test.ts
packages/razorpay/src/webhooks.test.ts
packages/razorpay/src/payout.test.ts
packages/graph/src/types.ts                          optional: no change if Event props suffice
packages/seed/src/arka.ts                            add sample Event nodes optional — prefer creating Events at runtime only
```

No changes to `apps/web` required for “done when” (API + package only). Step 4 adds UI.

---

## Environment variables (lock these names)

Add to `.env.example`:

```
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
# Optional — enables RazorpayXProvider instead of LedgerPayoutProvider
RAZORPAYX_KEY_ID=
RAZORPAYX_KEY_SECRET=
PAYOUT_PROVIDER=ledger
```

`apps/api/src/env.ts`:

```ts
const envSchema = z.object({
  // ... existing ...
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAYX_KEY_ID: z.string().optional(),
  RAZORPAYX_KEY_SECRET: z.string().optional(),
  PAYOUT_PROVIDER: z.enum(["ledger", "razorpayx"]).default("ledger"),
});

export function razorpayConfigured(env: Env): boolean {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}
```

---

## Razorpay API shapes (locked)

Base URL: `https://api.razorpay.com/v1`

Auth: Basic `{KEY_ID}:{KEY_SECRET}` base64.

### Create Payment Link — POST `/payment_links`

Request body (minimum):

```json
{
  "amount": 1480000,
  "currency": "INR",
  "description": "Invoice INV-90 — Lotus Boutique",
  "customer": { "name": "Lotus Boutique", "email": "billing@lotusboutique.example" },
  "notify": { "sms": false, "email": false },
  "reminder_enable": false,
  "notes": { "org_id": "org_arka", "invoice_key": "Invoice:INV-90" }
}
```

Response fields we persist:

```ts
export type RazorpayPaymentLink = {
  id: string;           // plink_xxx
  short_url: string;
  amount: number;
  currency: string;
  status: "created" | "paid" | "partially_paid" | "cancelled" | "expired";
  created_at: number;
};
```

Header on every POST: `X-Razorpay-Idempotency-Key: {key}`

### Webhook events handled (MVP)

| Event | Graph action |
|---|---|
| `payment_link.paid` | Update Payment → `captured`; Invoice → `paid` if linked |
| `payment_link.expired` | Payment → `expired`; Event audit |
| `payment.captured` | Payment → `captured` |
| `payment.failed` | Payment → `failed` |
| `refund.processed` | Payment props `refund_status=processed`; Event audit |

Ignore unknown events with 200 + `{ received: true }` (no graph write).

Webhook signature: HMAC SHA256 of raw body with `RAZORPAY_WEBHOOK_SECRET`, header `X-Razorpay-Signature`.

---

### Task 1: `packages/razorpay` scaffold

**Files:**
- Create: `packages/razorpay/package.json`, `tsconfig.json`, `src/index.ts`

**Interfaces:**
- Produces: `@karya/razorpay` workspace package

`package.json`:

```json
{
  "name": "@karya/razorpay",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.24.4"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "vitest": "^3.1.3"
  }
}
```

Root `pnpm-workspace` already includes `packages/*`. Add `"@karya/razorpay": "workspace:*"` to `apps/api/package.json`.

---

### Task 2: Razorpay client + idempotency

**Files:**
- Create: `packages/razorpay/src/types.ts`
- Create: `packages/razorpay/src/client.ts`
- Create: `packages/razorpay/src/idempotency.ts`
- Test: `packages/razorpay/src/payment-links.test.ts` (mock fetch)

**Interfaces:**

```ts
// types.ts
export type RazorpayCredentials = {
  keyId: string;
  keySecret: string;
};

export class RazorpayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

// client.ts
export class RazorpayClient {
  constructor(private readonly creds: RazorpayCredentials) {}

  async post<T>(
    path: string,
    body: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Basic ${Buffer.from(`${this.creds.keyId}:${this.creds.keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    };
    if (idempotencyKey) {
      headers["X-Razorpay-Idempotency-Key"] = idempotencyKey;
    }
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new RazorpayError(`Razorpay ${path} failed`, res.status, json);
    return json as T;
  }

  async get<T>(path: string): Promise<T> { /* same auth, no body */ }
}

// idempotency.ts
export function idempotencyKey(
  orgId: string,
  action: string,
  ref: string,
): string {
  const safe = ref.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64);
  return `karya_${orgId}_${action}_${safe}`;
}
```

Tests: mock `global.fetch`; assert Authorization header and idempotency header present.

---

### Task 3: Payment Links module

**Files:**
- Create: `packages/razorpay/src/payment-links.ts`

**Interfaces:**

```ts
export type CreatePaymentLinkInput = {
  amountInPaise: number;
  currency?: "INR";
  description: string;
  customer?: { name: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  expireBy?: number; // unix seconds
};

export async function createPaymentLink(
  client: RazorpayClient,
  input: CreatePaymentLinkInput,
  idempotencyKey: string,
): Promise<RazorpayPaymentLink> {
  return client.post<RazorpayPaymentLink>(
    "/payment_links",
    {
      amount: input.amountInPaise,
      currency: input.currency ?? "INR",
      description: input.description,
      customer: input.customer,
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: input.notes,
      expire_by: input.expireBy,
    },
    idempotencyKey,
  );
}
```

---

### Task 4: Webhook verification

**Files:**
- Create: `packages/razorpay/src/webhooks.ts`
- Test: `packages/razorpay/src/webhooks.test.ts`

**Interfaces:**

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  try {
    return timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(signature, "utf8"),
    );
  } catch {
    return false;
  }
}

export type RazorpayWebhookPayload = {
  event: string;
  payload: {
    payment_link?: { entity: RazorpayPaymentLink };
    payment?: { entity: { id: string; status: string; amount: number; order_id?: string } };
    refund?: { entity: { id: string; payment_id: string; amount: number } };
  };
};
```

Test with known body + secret from Razorpay docs fixture.

---

### Task 5: PayoutAdapter

**Files:**
- Create: `packages/razorpay/src/payout.ts`
- Test: `packages/razorpay/src/payout.test.ts`

**Interfaces:**

```ts
export type PayoutRequest = {
  orgId: string;
  vendorOrgKey: string;
  amountInPaise: number;
  purpose: string;
  idempotencyKey: string;
  explanation: string;
};

export type PayoutResult = {
  provider: "ledger" | "razorpayx";
  payoutId: string;
  status: "queued" | "processed" | "failed";
  razorpayPayoutId?: string;
};

export interface PayoutAdapter {
  proposePayout(req: PayoutRequest): Promise<PayoutResult>;
}

/** Default MVP — writes graph-ready result without bank call */
export class LedgerPayoutProvider implements PayoutAdapter {
  async proposePayout(req: PayoutRequest): Promise<PayoutResult> {
    return {
      provider: "ledger",
      payoutId: `ledger_${req.idempotencyKey}`,
      status: "queued",
    };
  }
}

/** Optional — only when RAZORPAYX keys present */
export class RazorpayXProvider implements PayoutAdapter {
  constructor(private readonly client: RazorpayClient) {}
  async proposePayout(req: PayoutRequest): Promise<PayoutResult> {
    // POST /v1/payouts — test mode; full implementation stub OK if keys absent in CI
    // Return razorpayPayoutId on success
    throw new Error("RazorpayXProvider: implement when keys configured");
  }
}

export function createPayoutAdapter(env: {
  provider: "ledger" | "razorpayx";
  razorpayxConfigured: boolean;
  client?: RazorpayClient;
}): PayoutAdapter {
  if (env.provider === "razorpayx" && env.razorpayxConfigured && env.client) {
    return new RazorpayXProvider(env.client);
  }
  return new LedgerPayoutProvider();
}
```

Ledger provider must always work without external keys. RazorpayX can throw until keys supplied — tests cover Ledger only.

---

### Task 6: Audit service (Event nodes)

**Files:**
- Create: `apps/api/src/services/audit.ts`

**Interfaces:**
- Consumes: `GraphStore`, `newNodeId`, `newEdgeId` from `@karya/graph`
- Produces: `writeAuditEvent(...)`, `listAuditEvents(...)`

```ts
export type SideEffectClass = "read" | "draft" | "write" | "money" | "external";

export type AuditEventInput = {
  orgId: string;
  eventType: string;       // e.g. "payment_link.created"
  actor: string;           // "system" | "human:anika@arka.atelier" | "webhook:razorpay"
  sideEffectClass: SideEffectClass;
  payload: Record<string, unknown>;
  aboutNodeIds?: string[]; // CAUS edges to business nodes
};

export async function writeAuditEvent(
  store: GraphStore,
  input: AuditEventInput,
): Promise<NodeRecord> {
  const key = `Event:${input.eventType}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const node = await store.upsertNode({
    _id: newNodeId(),
    orgId: input.orgId,
    type: "Event",
    key,
    label: input.eventType,
    props: {
      event_type: input.eventType,
      actor: input.actor,
      side_effect_class: input.sideEffectClass,
      payload_json: JSON.stringify(input.payload),
      at: new Date().toISOString(),
    },
  });

  for (const aboutId of input.aboutNodeIds ?? []) {
    await store.writeEdge({
      _id: newEdgeId(),
      orgId: input.orgId,
      type: "CAUSED",
      fromId: node._id,
      toId: aboutId,
      props: {},
      validFrom: new Date(),
    });
  }

  return node;
}

export async function listAuditEvents(
  store: GraphStore,
  orgId: string,
  filter?: { actor?: string; sideEffectClass?: SideEffectClass; limit?: number },
): Promise<NodeRecord[]> {
  const events = await store.listNodes(orgId, "Event");
  let filtered = events.sort(
    (a, b) => new Date(String(b.props.at)).getTime() - new Date(String(a.props.at)).getTime(),
  );
  if (filter?.actor) {
    filtered = filtered.filter((e) => e.props.actor === filter.actor);
  }
  if (filter?.sideEffectClass) {
    filtered = filtered.filter(
      (e) => e.props.side_effect_class === filter.sideEffectClass,
    );
  }
  const limit = filter?.limit ?? 50;
  return filtered.slice(0, limit);
}
```

---

### Task 7: Payment link orchestration service

**Files:**
- Create: `apps/api/src/services/payment-links.ts`

**Interfaces:**

```ts
export type CreatePaymentLinkForInvoiceInput = {
  orgId: string;
  invoiceKey: string;
  idempotencyKey?: string;
  actor?: string;
};

export type CreatePaymentLinkForInvoiceResult = {
  paymentNode: NodeRecord;
  razorpay: RazorpayPaymentLink;
  created: boolean; // false if idempotent replay
};

export async function createPaymentLinkForInvoice(
  store: GraphStore,
  client: RazorpayClient,
  audit: typeof writeAuditEvent,
  input: CreatePaymentLinkForInvoiceInput,
): Promise<CreatePaymentLinkForInvoiceResult> {
  // 1. Resolve Invoice node by key; 404 if missing
  // 2. amountInPaise from invoice.props.amountInPaise
  // 3. idempotencyKey = input.idempotencyKey ?? idempotencyKey(orgId, "payment_link", invoiceKey)
  // 4. Check existing Payment with props.idempotency_key === key → return existing (created: false)
  // 5. Call createPaymentLink(client, ...)
  // 6. upsertNode Payment — key `Payment:{razorpay_id}`, props: status sent, channel payment_link, razorpay_payment_link_id, short_url, idempotency_key
  // 7. writeEdge PAYS from Payment → Invoice (supersede if needed)
  // 8. writeAuditEvent payment_link.created, sideEffectClass money, aboutNodeIds [payment, invoice]
}
```

Customer name: traverse `Invoice → INVOICES ← SalesOrder → BUYS ← Org` for buyer label; fallback `"Customer"`.

---

### Task 8: API routes

**Files:**
- Create: `apps/api/src/routes/payment-links.ts`
- Create: `apps/api/src/routes/webhooks.ts`
- Create: `apps/api/src/routes/audit.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/v1/payment-links` | `x-org-id` | `{ invoiceKey: string, idempotencyKey?: string }` | `{ payment, razorpay, created }` |
| POST | `/v1/webhooks/razorpay` | signature only | raw JSON | `{ received: true }` |
| GET | `/v1/audit` | `x-org-id` | query: `?actor=&sideEffectClass=&limit=` | `{ events: NodeRecord[] }` |

- [ ] **Step 1: Raw body for webhooks**

Register webhook route **before** JSON parser or use Fastify `addContentTypeParser` for `application/json` with `parseAs: 'buffer'` on webhook path only:

```ts
app.addContentTypeParser(
  "application/json",
  { parseAs: "buffer" },
  (req, body, done) => {
    if (req.url.startsWith("/v1/webhooks/razorpay")) {
      done(null, body);
      return;
    }
    try {
      done(null, JSON.parse(body.toString()));
    } catch (err) {
      done(err as Error, undefined);
    }
  },
);
```

- [ ] **Step 2: POST /v1/payment-links**

If `!razorpayConfigured(env)` → 503 `{ error: "razorpay_not_configured" }`.

Call `createPaymentLinkForInvoice`. Map `RazorpayError` to 502 with `{ error: "razorpay_error", detail }`.

- [ ] **Step 3: POST /v1/webhooks/razorpay**

1. Read `X-Razorpay-Signature`
2. `verifyWebhookSignature(rawBody, signature, env.RAZORPAY_WEBHOOK_SECRET!)` — if no secret, 503
3. Parse JSON
4. Dispatch by `event` (see table in Task intro)
5. Find Payment by `props.razorpay_payment_link_id` or `razorpay_payment_id`
6. Upsert node props for new status
7. On `payment_link.paid` / `payment.captured`: update linked Invoice to `paid` if edge exists
8. `writeAuditEvent` with `actor: "webhook:razorpay"`, appropriate `eventType`

Org id: read from Payment node or `notes.org_id` on payment link entity.

- [ ] **Step 4: GET /v1/audit**

Return `{ events: await listAuditEvents(store, orgId, query) }`.

- [ ] **Step 5: Register in app.ts**

```ts
await scoped.register(paymentLinksRoutes, { env });
await scoped.register(auditRoutes);
// webhooks outside org-id hook — separate plugin without x-org-id preHandler
await app.register(webhookRoutes, { env, store });
```

---

### Task 9: Tests

**Files:**
- Create: `apps/api/src/test/payment-links.test.ts`
- Create: `apps/api/src/test/webhooks.test.ts`

- [ ] **Payment link route test (mock Razorpay fetch)**

Seed graph → POST `/v1/payment-links` with `{ invoiceKey: "Invoice:INV-90" }` → assert Payment node created, audit Event exists, PAYS edge to INV-90.

- [ ] **Idempotency test**

Same request twice → same Payment `_id`, `created: false` on second.

- [ ] **Webhook test**

Build signed payload for `payment_link.expired` → POST webhook → Payment status `expired`, Event `payment_link.expired`.

- [ ] **Invalid signature → 401**, no graph changes.

Run: `pnpm --filter @karya/razorpay test && pnpm --filter @karya/api test`

---

### Task 10: Manual verification (requires test keys)

Document in plan (engineer runs locally):

```
curl -X POST http://localhost:4000/v1/payment-links \
  -H "x-org-id: org_arka" \
  -H "Content-Type: application/json" \
  -d '{"invoiceKey":"Invoice:INV-90"}'

curl -H "x-org-id: org_arka" "http://localhost:4000/v1/audit?sideEffectClass=money&limit=10"
```

Use Razorpay dashboard test mode to trigger webhook via ngrok or Razorpay webhook tester.

---

## Done when

- `packages/razorpay` exports client, payment links, webhook verify, payout adapters.
- Every Razorpay POST sends `X-Razorpay-Idempotency-Key`.
- `POST /v1/payment-links` creates a real test-mode Payment Link when keys configured.
- `POST /v1/webhooks/razorpay` verifies signature and updates Payment/Invoice + audit Events.
- `GET /v1/audit` returns Event nodes newest-first with filters.
- `LedgerPayoutProvider` works without RazorpayX keys.
- All package and API tests pass.
- No agents, no policy checks, no approval UI.

## Out of scope (step 4+)

Policy engine, approval cards, mandate evaluation, Money agent, Governor, `/a2a`, audit explorer UI, Razorpay Orders (non-link), QR/UPI APIs, live bank payouts, forced failure demo loop (Step 7).

---

## Self-review

- Spec §8.5 Money MVP — Payment Links + webhooks + payout interface + idempotency.
- Spec §9.1 — events handled match MVP list.
- Spec §9.2 audit trail — Event nodes, not a side table.
- Spec §14 item 3 — infrastructure before agents.
- Graph writes only through `GraphStore`; no parallel payment DB.
- API shapes locked; env var names locked.
- No TBD on webhook events or idempotency format.
