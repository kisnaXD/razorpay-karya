# Karya Step 8 — Sourcing Agent + Vendor Search + Draft PO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a **Sourcing** tool namespace to the Governor loop so the operator can shortlist brass vendors for a material below reorder, optionally browse a public page (Playwright bonus), and **draft a Purchase Order** from graph context — with every browse logged as an `Event`, PO creation behind an Approval card, and a seeded vendor directory so the Buildathon demo cannot be killed by IndiaMART layout changes.

**Architecture:** Seeded vendor directory in `packages/seed` + pure search in `packages/agents/src/sourcing`. `apps/api` exposes `/v1/sourcing/*` and `draftPurchaseOrder` service. Governor gains four Sourcing tools (`sourcing_search_vendors`, `sourcing_browse_public`, `sourcing_draft_po`, `sourcing_explain_need`). **MVP path:** directory search only; live Playwright runs in `apps/worker` behind a feature flag and domain allowlist. PO approval uses Step 4 `createApproval` with action `po.create`; on approve, writes `PurchaseOrder` + `ORDER_CONTAINS` + vendor edges + optional inbound `Shipment`.

**Tech Stack:** TypeScript 5.8 strict, existing `@karya/agents`, `@karya/graph`, `@karya/policy`, Fastify 5, MongoDB jobs collection (browser queue), Playwright 1.x in `apps/worker` only (optional), Vitest, Step 5 Governor loop + Step 4 approvals.

## Global Constraints

From spec §7.4, §8.3, §11 step 3, and Steps 1–7.

- **Seeded directory is the demo-critical path.** Live browser is bonus. Demo script must pass with `BROWSER_ENABLED=false`.
- **Sourcing never moves money.** All tools are `read`, `draft`, or `write` (PO graph nodes only). No `money` tools in this step.
- **Browser hard rules (spec §7.4):** GET/search only. No credentials, no form POST, no CAPTCHA bypass. Every session → `Event` node with `event_type: "browse.session"` or `"browse.failed"`. Screenshots stored as base64 in Event props (max 200KB each, max 3 URLs per session).
- **PO creation is gated:** `po.create` always `require_approval` unless a future mandate exists — Step 8 does not add autonomy for POs.
- **Closed graph schema.** PO keys: `PurchaseOrder:PO-{next}` where `next` is monotonic from existing PO count (start at `PO-105` after seed `PO-104`). Edges: vendor `Org` — `CONTACT_AT` or reuse existing `SUPPLIES`; PO `ORDER_CONTAINS` Material; optional `Shipment` `FULFILLS` PO with `status: "expected"`.
- **Explanation string required** on every tool call (`explanation`, min 8 chars).
- **Fallback failure path (spec §7.6):** If `sourcing_browse_public` fails, tool returns `{ ok: false, fallback: "directory", vendors: [...] }` and writes `Event:browse.failed`. Demo continues.
- **Governor remains one loop.** Sourcing is a tool namespace, not a second LLM.
- Tests: vendor search against seed; draft PO creates approval; approve writes graph; browse mocked (no Playwright in CI).
- UI tokens unchanged. Tool traces in AgentRail follow Step 5 patterns.

---

## File structure (this step creates / modifies)

```
packages/seed/src/vendor-directory.ts          static vendor catalog (new)
packages/seed/src/arka.ts                      second vendor Org + SUPPLIES edge (modify)
packages/seed/src/arka.test.ts                 vendor count assertion (modify)

packages/agents/src/sourcing/search.ts         directory + graph-aware need detection (new)
packages/agents/src/sourcing/search.test.ts
packages/agents/src/sourcing/draft-po.ts         pure draft builder from graph context (new)
packages/agents/src/sourcing/draft-po.test.ts
packages/agents/src/tools/sourcing.ts            four Sourcing tools (new)
packages/agents/src/tools/index.ts               register sourcing namespace (modify)
packages/agents/src/system-prompt.ts             Sourcing section (modify)

packages/policy/src/actions.ts                   add po.create (modify)

apps/worker/package.json                         Playwright dep (new package)
apps/worker/tsconfig.json
apps/worker/src/index.ts                         job consumer entry
apps/worker/src/env.ts
apps/worker/src/jobs/browser-browse.ts           Playwright GET + screenshot
apps/worker/src/jobs/types.ts

apps/api/package.json                            @karya/agents sourcing paths (modify)
apps/api/src/env.ts                              BROWSER_ENABLED, BROWSER_ALLOWLIST (modify)
apps/api/src/mongo.ts                            jobs collection + indexes (modify)
apps/api/src/app.ts                              register sourcing routes (modify)
apps/api/src/services/sourcing.ts                search, enqueue browse, explain need
apps/api/src/services/purchase-orders.ts           draft + commit PO on approval
apps/api/src/routes/sourcing.ts
apps/api/src/test/sourcing.test.ts
apps/api/src/test/purchase-orders.test.ts

apps/web/src/lib/api.ts                          sourcing types (modify)
apps/web/src/components/agent/ToolTraceRow.tsx   sourcing tool labels (modify if needed)

.env.example                                     BROWSER_* vars (modify)
docker-compose.yml                               optional worker service comment (modify)
```

No new canvas nav items. Sourcing is invoked via Governor chat and demo prompt: *"We need brass sheet — shortlist vendors and draft a PO."*

---

## Seeded vendor directory (locked)

File: `packages/seed/src/vendor-directory.ts`

Static array consumed by search and seeded into graph as `Org` nodes:

| key | label | city | materials | pricePerKgInPaise | leadDays | verified_bank | notes |
|---|---|---|---|---:|---:|---|---|
| `Org:Meenakshi-Brass` | Meenakshi Brass | Moradabad | BrassSheet-22g | 42000 | 5 | true | Existing seed vendor; PO-104 open |
| `Org:Shree-Metal-Works` | Shree Metal Works | Aligarh | BrassSheet-22g | 40500 | 7 | true | Alternate brass sheet supplier |
| `Org:Jaipur-Alloys` | Jaipur Alloys | Jaipur | BrassSheet-22g | 43800 | 3 | false | Local; not verified for payout |

`Material:BrassSheet-22g` is the only material with directory entries in Step 8.

Seed change: upsert `Org:Shree-Metal-Works` and `Org:Jaipur-Alloys`, add `SUPPLIES` edges to `Material:BrassSheet-22g`. Meenakshi already exists.

Search ranks by: (1) material match, (2) `verified_bank` desc, (3) `pricePerKgInPaise` asc, (4) `leadDays` asc.

---

## Tool catalog (locked)

| Tool name | Class | Policy | Graph write |
|---|---|---|---|
| `sourcing_explain_need` | read | no | no |
| `sourcing_search_vendors` | read | no | no |
| `sourcing_browse_public` | external | `browser.get` allow; failures log Event | yes (Event only) |
| `sourcing_draft_po` | draft | `po.create` → require_approval | yes (Approval + draft payload) |

### Tool Zod schemas

```ts
// sourcing_explain_need
{
  materialKey: string;          // Material:BrassSheet-22g
  triggerSalesOrderKey?: string; // SalesOrder:SO-218
  explanation: string;
}
// returns { materialKey, reorderPoint, onHandKg, reservedKg, incomingKg,
//           blockers: [{ nodeKey, detail }], suggestedQtyKg, whyParagraph }

// sourcing_search_vendors
{
  materialKey: string;
  maxResults?: number;          // default 3, max 5
  preferVerified?: boolean;     // default true
  explanation: string;
}
// returns { vendors: VendorHit[], source: "directory" | "directory+fallback" }

// sourcing_browse_public
{
  url: string;                  // must match allowlist host
  purpose: string;              // e.g. "IndiaMART brass sheet search"
  explanation: string;
}
// returns { ok, title?, snippet?, screenshotEventKey?, error?, fallbackVendors? }

// sourcing_draft_po
{
  vendorOrgKey: string;         // Org:Shree-Metal-Works
  materialKey: string;
  qtyKg: number;                // z.number().positive()
  reasonSalesOrderKeys?: string[];
  expectedAtDays?: number;      // default 5
  explanation: string;
}
// returns { status: "awaiting_approval" | "denied"; approvalId?; draftPreview }
```

---

## `sourcing_explain_need` logic (locked)

Pure function in `packages/agents/src/sourcing/draft-po.ts` (exported as `explainMaterialNeed`).

1. Load Material node; read `reorder_point` (default 15 kg).
2. Sum brass demand: open/promised `SalesOrder` lines via `ORDER_CONTAINS` → SKU → `MADE_FROM` → Material qty × line qty. Include `triggerSalesOrderKey` if provided.
3. Read inbound: open `PurchaseOrder` + `Shipment` `FULFILLS` with `status` not `received`/`cancelled`.
4. Compute `availableKg` from workshop stock nodes linked via `STOCK_OF` → SKU → `MADE_FROM` — for raw material, use Material props `on_hand` if present else derive from seed exception context (PO-104 qty 40 incoming).
5. `suggestedQtyKg = max(reorder_point - availableKg + shortfall, reorder_point)` rounded to nearest 5 kg; for demo default **40 kg** when `materialKey === "Material:BrassSheet-22g"` and SO-218 in graph.
6. `whyParagraph` template: *"We need {qty}kg {materialLabel} because {SO-218 detail} and reorder point is {reorder}kg. PO-104 is late by 4 days."*

---

## Draft PO + approval flow (locked)

`apps/api/src/services/purchase-orders.ts`

```ts
export type DraftPurchaseOrderInput = {
  orgId: string;
  vendorOrgKey: string;
  materialKey: string;
  qtyKg: number;
  reasonSalesOrderKeys?: string[];
  expectedAtDays?: number;
  explanation: string;
  proposedBy: "agent:sourcing";
};

export type DraftPurchaseOrderPreview = {
  poKey: string;                // PurchaseOrder:PO-105 (computed)
  vendorLabel: string;
  materialLabel: string;
  qtyKg: number;
  estimatedTotalInPaise: number;
  expectedAt: string;
  why: string;
};

export async function draftPurchaseOrder(
  db: Db,
  store: GraphStore,
  input: DraftPurchaseOrderInput,
): Promise<{ approvalId: string; preview: DraftPurchaseOrderPreview }>;

export async function commitPurchaseOrder(
  store: GraphStore,
  orgId: string,
  approvalId: string,
  resolvedBy: string,
): Promise<{ poKey: string; shipmentKey: string }>;
```

**Policy action (add to `packages/policy/src/actions.ts`):** `po.create` — effect `require_approval`, rule: always (no autonomy in Step 8).

**ProposedAction shape:**

```ts
{
  action: "po.create",
  proposedBy: "agent:sourcing",
  explanation: string,
  amountInPaise: estimatedTotalInPaise,
  target: { type: "Org", key: vendorOrgKey },
  payload: { materialKey, qtyKg, poKey, reasonSalesOrderKeys, expectedAt }
}
```

**On approve (`commitPurchaseOrder`):**

1. Upsert `PurchaseOrder:{poKey}` with `status: "open"`, `expectedAt`, `qty`, `amountInPaise`.
2. `ORDER_CONTAINS` PO → Material `{ qty, uom: "kg" }`.
3. Vendor `Org` already `SUPPLIES` Material — no new edge if exists.
4. Create `Shipment:IN-{next}` with `direction: "inbound"`, `status: "expected"`, `FULFILLS` → PO.
5. `writeAuditEvent` + `Event` `po.created`.
6. Resume Governor thread (Step 5 `resumeAfterApproval`).

Approval card title: *"Draft PO — 40kg brass sheet to Shree Metal Works"*. Amount: estimated total mono.

---

## Browser sandbox (bonus path, locked)

**Feature flag:** `BROWSER_ENABLED=true` in worker env only. API enqueues job; API never runs Playwright.

**Allowlist (exact hosts):**

```
indiamart.com
www.indiamart.com
shreemetalworks.example.com   # static demo page in packages/seed/public/demo-vendor.html served locally
```

For Buildathon reliability, ship `packages/seed/public/demo-vendor.html` — a one-page fake vendor profile. Worker can browse `http://127.0.0.1:4001/demo-vendor.html` in dev. Production demo uses directory only.

**Job document (`jobs` collection):**

```ts
{
  _id: string;
  type: "browser.browse";
  orgId: string;
  url: string;
  purpose: string;
  status: "pending" | "running" | "done" | "failed";
  result?: { title: string; textSnippet: string; screenshotBase64: string };
  error?: string;
  eventKey?: string;
  createdAt: Date;
  completedAt?: Date;
}
```

Worker: headless Chromium, 15s timeout, `page.goto`, extract `document.title` + first 500 chars body text, screenshot viewport PNG base64.

API route: `POST /v1/sourcing/browse` → enqueue → poll `GET /v1/sourcing/browse/:jobId` (Governor tool polls up to 3 times with 2s delay, then falls back).

**Policy:** Add seed `Policy:browser.get` with `action: "browser.get"`, effect `allow`, rules: URL host in allowlist.

---

## API routes (locked)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/sourcing/vendors` | `?materialKey=&limit=` | `{ vendors: VendorHit[] }` |
| GET | `/v1/sourcing/need` | `?materialKey=&soKey=` | `ExplainNeedResult` |
| POST | `/v1/sourcing/draft-po` | `DraftPurchaseOrderInput` | `{ approvalId, preview }` |
| POST | `/v1/sourcing/browse` | `{ url, purpose, explanation }` | `{ jobId }` — 503 if `BROWSER_ENABLED=false` |
| GET | `/v1/sourcing/browse/:jobId` | | `{ status, result?, error? }` |

All routes require `x-org-id`.

---

## Governor system prompt addition (locked)

Append to `packages/agents/src/system-prompt.ts`:

```
## Sourcing (buy side)
- Explain material need from graph before recommending vendors.
- Prefer sourcing_search_vendors (directory) over browse unless operator asks for live web.
- Draft PO only after shortlisting; one PO per turn max.
- Cite node keys: Material:BrassSheet-22g, Org:Shree-Metal-Works, SalesOrder:SO-218.
- If browse fails, say so and continue with directory results — never stop the task.
```

---

## Demo script hook (spec §11 step 3)

Operator message (or preloaded demo button in AgentRail footer — optional, not required for done-when):

> "Brass sheet is blocking SO-218. Shortlist vendors and draft a PO for 40kg."

Expected Governor trace:

1. `sourcing_explain_need` → 40kg, PO-104 late, SO-218
2. `sourcing_search_vendors` → Meenakshi + Shree Metal Works (Jaipur Alloys third, unverified)
3. *(Optional)* `sourcing_browse_public` → success or fallback Event
4. `sourcing_draft_po` → Shree Metal Works → Approval card
5. Operator Approve → `PurchaseOrder:PO-105` + `Shipment:IN-78` on graph

---

### Task 1: Vendor directory + seed enrichment

**Files:**
- Create: `packages/seed/src/vendor-directory.ts`
- Modify: `packages/seed/src/arka.ts`, `packages/seed/src/arka.test.ts`

- [ ] **Step 1: Export `VENDOR_DIRECTORY` and lookup helpers**

```ts
export type VendorDirectoryEntry = {
  orgKey: string;
  label: string;
  city: string;
  materialKeys: string[];
  pricePerKgInPaise: number;
  leadDays: number;
  verified_bank: boolean;
  notes: string;
};

export function searchVendorDirectory(
  materialKey: string,
  opts?: { limit?: number; preferVerified?: boolean },
): VendorDirectoryEntry[];
```

- [ ] **Step 2: Seed Shree Metal Works + Jaipur Alloys + SUPPLIES edges**

Run: `pnpm --filter @karya/seed test`  
Expected: PASS; test asserts ≥3 brass vendors reachable from `Material:BrassSheet-22g` via `SUPPLIES`.

---

### Task 2: Sourcing pure functions + tests

**Files:**
- Create: `packages/agents/src/sourcing/search.ts`, `search.test.ts`
- Create: `packages/agents/src/sourcing/draft-po.ts`, `draft-po.test.ts`

- [ ] **Step 1: Tests first**

```ts
it("searchVendorDirectory returns Meenakshi and Shree for brass sheet", () => { ... });
it("explainMaterialNeed for SO-218 suggests 40kg and names PO-104", async () => { ... });
it("buildDraftPreview computes PO-105 key when PO-104 exists", async () => { ... });
```

- [ ] **Step 2: Implement until PASS**

Run: `pnpm --filter @karya/agents test`

---

### Task 3: Policy + purchase order service

**Files:**
- Modify: `packages/policy/src/actions.ts`
- Create: `apps/api/src/services/purchase-orders.ts`
- Create: `apps/api/src/test/purchase-orders.test.ts`

- [ ] **Step 1: Add `po.create` to policy actions; seed `Policy:po.create` in arka.ts**

```json
{
  "action": "po.create",
  "effect": "require_approval",
  "description": "All purchase orders require operator approval.",
  "rules": [{ "field": "action", op: "eq", value: "po.create" }]
}
```

- [ ] **Step 2: Tests — draft creates pending approval; commit writes PO + Shipment**

Run: `pnpm --filter @karya/api test`

---

### Task 4: Sourcing API routes + Governor tools

**Files:**
- Create: `apps/api/src/services/sourcing.ts`, `routes/sourcing.ts`
- Create: `packages/agents/src/tools/sourcing.ts`
- Modify: `packages/agents/src/tools/index.ts`, `system-prompt.ts`, `apps/api/src/app.ts`

- [ ] **Step 1: Wire routes and service**

- [ ] **Step 2: Register four tools in Governor `buildTools`**

- [ ] **Step 3: Integration test — mocked LLM calls `sourcing_draft_po`, approval pending**

Run: `pnpm --filter @karya/api test`

---

### Task 5: Browser worker (bonus — implement last)

**Files:**
- Create: `apps/worker/*` as listed above
- Modify: `.env.example`, `docker-compose.yml` (comment block for worker)

- [ ] **Step 1: Job enqueue from API when `BROWSER_ENABLED=true`**

- [ ] **Step 2: Worker consumes jobs, writes Event on complete/fail**

- [ ] **Step 3: Manual check with demo-vendor.html locally**

Skip Task 5 entirely for minimal Buildathon path — mark done when Tasks 1–4 pass and demo works on directory only.

---

### Task 6: End-to-end demo verification

- [ ] **Step 1:** Seed graph; open console; send Governor message for brass PO.
- [ ] **Step 2:** Confirm approval card shows why paragraph referencing SO-218 + PO-104.
- [ ] **Step 3:** Approve; graph shows `PurchaseOrder:PO-105` and inbound shipment.
- [ ] **Step 4:** Audit explorer shows `po.created` and optional `browse.failed` if browse was tested.

---

## Done when

- `pnpm --filter @karya/seed test` and `pnpm --filter @karya/agents test` and sourcing API tests pass.
- Governor can shortlist ≥2 vendors for `Material:BrassSheet-22g` using directory search without browser.
- `sourcing_draft_po` creates a pending approval; approve writes `PurchaseOrder:PO-105`, `ORDER_CONTAINS`, inbound `Shipment`, and audit Event.
- Demo narrative step 3 (spec §11) is reproducible with `BROWSER_ENABLED=false`.
- Every browse attempt (if enabled) creates an `Event` node; failures fall back to directory without crashing the thread.

## Out of scope (Step 9+)

Comms drafts, calendar briefs, listings, live courier tracking, vendor payouts, multi-material POs, IndiaMART form submit, credential login.

---

## Self-review

- Spec §8.3 buy side: vendor shortlist + draft PO from graph context — Tasks 1–4.
- Spec §7.4 browser: Task 5 optional; Event logging + allowlist + no credentials — locked.
- Spec §11 demo step 3: Demo script hook section.
- Spec §7.6 browse failure fallback: `sourcing_browse_public` + directory fallback — locked.
- Builds on Step 5 Governor, Step 4 approvals, existing `PurchaseOrder`/`Shipment` node types — no schema invention.
- Seeded directory is primary; Playwright is explicitly bonus — matches buildathon scoping note.
