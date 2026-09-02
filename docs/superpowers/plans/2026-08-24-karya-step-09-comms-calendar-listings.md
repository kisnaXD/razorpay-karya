# Karya Step 9 — Comms Drafts + Calendar Brief + Listings + People Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship **thin, demo-ready** operator surfaces for the last three nav slots — **People**, **Calendar**, **Listings** — plus Comms draft tools in the Governor loop. One email draft (vendor chase on PO-104), one meeting prep brief (`Meeting:VendorCall-Thu`), one listing copy draft (`SKU:Diya-Large` → Instagram channel), and a People timeline built from graph neighborhood reads. No full CRM, no live WhatsApp, no marketplace publish.

**Architecture:** Pure graph-read services in `apps/api` (`comms`, `calendar`, `listings`, `people`). LLM copy generation via existing Governor infrastructure — three new tool namespaces (`comms`, `calendar`, `sales_listings`) with `draft` class only; send/publish always `require_approval`. Web enables nav items People / Calendar / Listings with single-purpose canvas views. Messages are graph nodes; Resend send is optional when `RESEND_API_KEY` set.

**Tech Stack:** TypeScript 5.8 strict, `@karya/agents`, `@karya/graph`, `@karya/policy`, Fastify 5, Vercel AI SDK `generateText` for copy (same model as Governor), Vitest, optional `resend` npm package behind env flag, Step 5 AgentRail + Step 8 PO context.

## Global Constraints

From spec §8.7–8.11, §11 step 6, and Steps 1–8.

- **One of each for MVP:** one email draft, one meeting brief, one listing draft. Views may show only seeded/demo content — not generic CRUD for all nodes.
- **Draft-first Comms.** Operator clicks Send on approval card (or mandate auto-send for collections from Step 7 — unchanged). Step 9 adds **vendor email draft** only; collections email reuse Step 7 if present.
- **No live WhatsApp.** People timeline renders seeded `Message:Vendor-Nudge` and any sent messages from prior steps.
- **Listing publish is Approval.** Action `listing.publish` already in policy catalog — always `require_approval`. Demo publish target: update existing `Listing:Diya-Large-Instagram` props + mock screenshot Event, not Instagram API.
- **Calendar is read + one brief.** Week view shows seeded `Meeting:VendorCall-Thu` (+ optional follow-up Task on approve). No Google Calendar sync.
- **People timeline = neighborhood(depth=2)** of Messages, SalesOrders, PurchaseOrders, Payments, Meetings for selected Org/Person.
- **LLM prompts include graph facts only** — model must not invent orders or amounts. Server builds a fact bundle; model writes prose.
- **Explanation string required** on draft tools.
- Tests: brief contains PO-104 + SO-218; listing mentions brass + Diya-Large; email draft references late shipment; no live LLM in CI (snapshot prompts or mock `generateText`).
- UI tokens unchanged. Copy: sharp ops lead, Hinglish optional if operator uses it.

---

## File structure (this step creates / modifies)

```
packages/agents/src/comms/draft-email.ts           fact bundle + prompt template (new)
packages/agents/src/comms/draft-email.test.ts
packages/agents/src/calendar/meeting-brief.ts      graph → brief sections (new)
packages/agents/src/calendar/meeting-brief.test.ts
packages/agents/src/listings/draft-listing.ts      SKU + materials → copy (new)
packages/agents/src/listings/draft-listing.test.ts
packages/agents/src/tools/comms.ts                 comms_draft_email (new)
packages/agents/src/tools/calendar.ts              calendar_meeting_brief (new)
packages/agents/src/tools/listings.ts              listings_draft_copy (new)
packages/agents/src/tools/index.ts                 register namespaces (modify)
packages/agents/src/system-prompt.ts               Comms · Calendar · Listings (modify)

apps/api/package.json                              resend optional (modify)
apps/api/src/env.ts                                RESEND_API_KEY, RESEND_FROM (modify)
apps/api/src/app.ts                                register routes (modify)
apps/api/src/services/comms.ts                     draft + send Message node
apps/api/src/services/calendar.ts                  list meetings + generate brief
apps/api/src/services/listings.ts                  draft + publish listing
apps/api/src/services/people.ts                    timeline from neighborhood
apps/api/src/routes/comms.ts
apps/api/src/routes/calendar.ts
apps/api/src/routes/listings.ts
apps/api/src/routes/people.ts
apps/api/src/test/comms.test.ts
apps/api/src/test/calendar.test.ts
apps/api/src/test/listings.test.ts
apps/api/src/test/people.test.ts

apps/web/src/lib/api.ts                            new view types + API helpers (modify)
apps/web/src/lib/console-context.tsx               people | calendar | listings views (modify)
apps/web/src/components/Console.tsx                route new views (modify)
apps/web/src/components/shell/NavRail.tsx          enable People, Calendar, Listings (modify)
apps/web/src/components/people/PeopleView.tsx      org picker + timeline (new)
apps/web/src/components/calendar/CalendarWeek.tsx  week strip + brief panel (new)
apps/web/src/components/listings/ListingDraft.tsx  single listing editor (new)
apps/web/src/components/comms/DraftEmailCard.tsx   inline draft preview in AgentRail (new)

.env.example                                       RESEND_* (modify)
packages/seed/src/arka.ts                          Meeting attendees props (modify)
```

No new node types. Optional: seed `Person:Meenakshi-Contact` with `CONTACT_AT` Meenakshi Brass for People demo.

---

## Scope matrix (locked — do not expand)

| Feature | Demo artifact | API | UI | Governor tool |
|---|---|---|---|---|
| Comms email | Vendor chase re PO-104 | `POST /v1/comms/draft-email` | DraftEmailCard in rail | `comms_draft_email` |
| Calendar brief | VendorCall-Thu prep | `GET /v1/calendar/brief?meetingKey=` | CalendarWeek + brief panel | `calendar_meeting_brief` |
| Listing copy | Diya-Large Instagram | `POST /v1/listings/draft` | ListingDraft view | `listings_draft_copy` |
| People CRM | Meenakshi + Lotus timelines | `GET /v1/people/:orgKey/timeline` | PeopleView | *(read-only via graph tools — no new tool)* |

---

## Tool catalog (locked)

| Tool name | Class | Policy | Graph write |
|---|---|---|---|
| `comms_draft_email` | draft | no until send | yes (Message draft node) |
| `comms_send_email` | external | `email.send` require_approval | yes (Message sent + Event) |
| `calendar_meeting_brief` | draft | no | no (brief returned to UI only; optional Task draft) |
| `listings_draft_copy` | draft | no | yes (updates Listing props `draft_*`) |
| `listings_publish` | external | `listing.publish` require_approval | yes (Listing status + Event) |

**Step 9 minimum Governor tools:** `comms_draft_email`, `calendar_meeting_brief`, `listings_draft_copy`. Send/publish wired to Approval cards but demo can use UI buttons calling API directly.

### Tool schemas

```ts
// comms_draft_email
{
  aboutNodeKey: string;         // PurchaseOrder:PO-104
  recipientOrgKey: string;      // Org:Meenakshi-Brass
  tone?: "firm" | "friendly";   // default firm
  explanation: string;
}
// returns { messageKey, subject, bodyText, bodyHtml }

// comms_send_email (optional tool — UI button sufficient for demo)
{
  messageKey: string;
  explanation: string;
}

// calendar_meeting_brief
{
  meetingKey: string;           // Meeting:VendorCall-Thu
  explanation: string;
}
// returns { meetingKey, startsAt, title, sections: BriefSection[] }

// listings_draft_copy
{
  skuKey: string;               // SKU:Diya-Large
  channel: "instagram" | "catalog";
  explanation: string;
}
// returns { listingKey, title, bullets: string[], hashtags: string[] }

// listings_publish
{
  listingKey: string;
  explanation: string;
}
```

---

## Meeting brief format (locked)

`packages/agents/src/calendar/meeting-brief.ts` — `buildMeetingBrief(store, orgId, meetingKey)`

Returns:

```ts
export type BriefSection = {
  heading: string;
  body: string;
};

export type MeetingBrief = {
  meetingKey: string;
  label: string;
  startsAt: string;
  attendeeOrgKey: string | null;
  sections: BriefSection[];
  proposedAsk: string;
};
```

**For `Meeting:VendorCall-Thu` (deterministic template + optional LLM polish):**

| Section | Content source |
|---|---|
| Context | PO-104 late 4d, IN-77 delayed |
| Demand | SO-218 needs brass by Friday, 8× Diya-Large |
| Last contact | `Message:Vendor-Nudge` props + timestamp |
| Numbers | 40kg sheet, ₹420/kg quote from directory |
| Proposed ask | *"Air remaining 15kg or confirm dispatch date for full 40kg"* |

LLM may rewrite `sections[].body` for fluency but **must not change numbers**. Server validates digits in output against fact bundle; if mismatch, use template text.

---

## Listing draft format (locked)

Input: `SKU:Diya-Large` + `MADE_FROM` brass + past Messages mentioning diya.

Output stored on `Listing:Diya-Large-Instagram` props:

```ts
{
  draft_title: string;
  draft_bullets: string;        // JSON stringified string[]
  draft_hashtags: string;
  draft_generated_at: string;
}
```

Example bullets (template fallback if no LLM):

1. Handcrafted large brass diya — Jaipur workshop
2. 22g brass sheet, polished finish
3. Ships across India · GST included
4. ₹1,850 · 12% GST

---

## Email draft (locked)

**Scenario:** Chase Meenakshi Brass on PO-104 / IN-77.

Fact bundle from graph: PO qty, expected date, delay days, SO-218 dependency, last message snippet.

Draft creates:

```ts
Message node key: Message:Draft-{ulid}
props: {
  channel: "email",
  direction: "out",
  status: "draft",
  subject: "PO-104 — brass sheet dispatch update",
  to: "procurement@meenakshibrass.example.com",
  body_text: "...",
}
```

Edge: `ABOUT` → `PurchaseOrder:PO-104`.

**Send flow:** `POST /v1/comms/send` with `{ messageKey }` → `createApproval` action `email.send` → on approve: if `RESEND_API_KEY`, call Resend; always update Message `status: "sent"`, `sentAt`, Event `message.sent`.

Seed policy `Policy:email.send`: `require_approval` always.

---

## People timeline (locked)

`GET /v1/people/:orgKey/timeline`

```ts
export type TimelineEntry = {
  at: string;
  kind: "message" | "order" | "payment" | "meeting" | "invoice";
  nodeKey: string;
  label: string;
  summary: string;
};

export async function getOrgTimeline(
  store: GraphStore,
  orgId: string,
  orgKey: string,
): Promise<{ org: NodeRecord; entries: TimelineEntry[] }>;
```

Algorithm:

1. Load Org node.
2. BFS neighborhood depth 2 from Org.
3. Collect nodes types: Message, SalesOrder, PurchaseOrder, Payment, Meeting, Invoice where path exists via `BUYS`, `SUPPLIES`, `CONTACT_AT`, `ABOUT`, `PAYS`, `INVOICES`.
4. Sort by date prop (`startsAt`, `createdAt`, `dueAt`) desc.
5. Cap at 20 entries.

**PeopleView UI:** Left column — seeded orgs (`Org:Meenakshi-Brass`, `Org:Lotus-Boutique`, `Org:Arka-Atelier`). Right — timeline list. Click row → focus graph node.

---

## Calendar week UI (locked)

`CalendarWeek.tsx`:

- Shows current week (Mon–Sun) in IST.
- One seeded meeting chip on Thursday 16:00 — `Meeting:VendorCall-Thu`.
- Click meeting → fetch brief from API → render sections in brief panel (copper left edge on proposed ask block).
- Button: **Create follow-up task** → `POST /v1/calendar/follow-up` writes `Task:FollowUp-{ulid}` with `ABOUT` meeting, `FOLLOW_UP` → PO-104. No approval required (Task write logged as audit `write`).

---

## Listings UI (locked)

`ListingDraft.tsx`:

- Loads `Listing:Diya-Large-Instagram` + linked SKU.
- Shows current draft props or empty state: *"Ask Governor to draft listing copy."*
- **Regenerate** calls API draft endpoint.
- **Publish** → approval card → on approve sets `status: "published"`, writes Event `listing.published` with mock payload `{ channel: "instagram", screenshot: "data:image/png;base64,..." }` (1×1 placeholder PNG acceptable for demo).

Listings nav shows this single listing — not a grid of all listings.

---

## API routes (locked)

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/comms/draft-email` | Body: tool input shape |
| POST | `/v1/comms/send` | Creates approval |
| GET | `/v1/calendar/meetings` | Week range query `?from=&to=` — returns Meeting nodes |
| GET | `/v1/calendar/brief` | `?meetingKey=` |
| POST | `/v1/calendar/follow-up` | `{ meetingKey, note? }` |
| POST | `/v1/listings/draft` | `{ skuKey, channel }` |
| POST | `/v1/listings/publish` | `{ listingKey }` → approval |
| GET | `/v1/people/orgs` | Vendor + customer orgs for picker |
| GET | `/v1/people/:orgKey/timeline` | |

---

## NavRail changes (locked)

Enable icons: **people**, **calendar**, **listings**.

```ts
export type ConsoleView =
  | "inbox" | "graph" | "orders" | "inventory" | "policy"
  | "people" | "calendar" | "listings";
```

Remove `DISABLED_TOOLTIPS` entries for these three.

---

### Task 1: Calendar meeting brief (pure + API)

**Files:**
- Create: `packages/agents/src/calendar/meeting-brief.ts`, `meeting-brief.test.ts`
- Create: `apps/api/src/services/calendar.ts`, `routes/calendar.ts`, `test/calendar.test.ts`

- [ ] **Step 1: Test — brief for VendorCall-Thu mentions PO-104, SO-218, proposed ask**

- [ ] **Step 2: Implement template brief; optional LLM polish behind flag `LLM_COPY_ENABLED`**

- [ ] **Step 3: Routes `GET /meetings`, `GET /brief`, `POST /follow-up`**

Run: `pnpm --filter @karya/api test`

---

### Task 2: Listing draft + publish approval

**Files:**
- Create: `packages/agents/src/listings/draft-listing.ts`, `draft-listing.test.ts`
- Create: `apps/api/src/services/listings.ts`, `routes/listings.ts`, `test/listings.test.ts`
- Modify: `packages/seed/src/arka.ts` — seed `Policy:listing.publish` if missing

- [ ] **Step 1: Draft updates Listing props on graph**

- [ ] **Step 2: Publish creates approval; approve sets published + Event**

Run: `pnpm --filter @karya/api test`

---

### Task 3: Comms email draft + send

**Files:**
- Create: `packages/agents/src/comms/draft-email.ts`, `draft-email.test.ts`
- Create: `apps/api/src/services/comms.ts`, `routes/comms.ts`, `test/comms.test.ts`

- [ ] **Step 1: Draft creates Message node + ABOUT edge**

- [ ] **Step 2: Send with approval; Resend optional**

- [ ] **Step 3: Seed `Policy:email.send` require_approval**

Run: `pnpm --filter @karya/api test`

---

### Task 4: People timeline

**Files:**
- Create: `apps/api/src/services/people.ts`, `routes/people.ts`, `test/people.test.ts`

- [ ] **Step 1: Timeline for Meenakshi includes PO-104, Vendor-Nudge, VendorCall-Thu**

- [ ] **Step 2: Timeline for Lotus includes SO-218, INV-90, plink_7**

Run: `pnpm --filter @karya/api test`

---

### Task 5: Governor tools

**Files:**
- Create: `packages/agents/src/tools/comms.ts`, `calendar.ts`, `listings.ts`
- Modify: `tools/index.ts`, `system-prompt.ts`

- [ ] **Step 1: Register three draft tools (minimum)**

- [ ] **Step 2: Mocked integration test — brief tool returns sections**

Run: `pnpm --filter @karya/agents test`

---

### Task 6: Web views

**Files:**
- Create: `PeopleView.tsx`, `CalendarWeek.tsx`, `ListingDraft.tsx`, `DraftEmailCard.tsx`
- Modify: `Console.tsx`, `NavRail.tsx`, `console-context.tsx`, `api.ts`, `AgentRail.tsx`

- [ ] **Step 1: Enable nav + route three views**

- [ ] **Step 2: Calendar shows Thu meeting + brief panel**

- [ ] **Step 3: Listings shows Diya-Large Instagram draft**

- [ ] **Step 4: People shows Meenakshi timeline; row click focuses graph**

- [ ] **Step 5: Visual check at 1280×800 — still ink/surface tokens, no white dashboard**

---

### Task 7: Demo verification (spec §11 step 6)

- [ ] **Step 1:** Open Calendar → VendorCall-Thu → brief shows PO-104 late + proposed ask.
- [ ] **Step 2:** Governor: *"Draft a vendor email chasing PO-104"* → draft appears.
- [ ] **Step 3:** Listings → regenerate copy for Diya-Large → publish via approval (mock screenshot).

---

## Done when

- People, Calendar, Listings nav items enabled and render demo content (not disabled tooltips).
- `GET /v1/calendar/brief?meetingKey=Meeting:VendorCall-Thu` returns brief with PO-104 + SO-218 + proposed ask.
- One email draft creatable via API or Governor; Message node on graph with `status: draft`.
- One listing draft updates `Listing:Diya-Large-Instagram` props; publish goes through approval.
- People timeline for `Org:Meenakshi-Brass` returns ≥3 entries including PO-104 and meeting.
- All new tests pass; no live WhatsApp, no Instagram API, no full module CRUD.

## Out of scope (Step 10)

AWS deploy, pitch video, README polish, Gmail adapter, lead research browser, multi-listing grid, campaign segments.

---

## Self-review

- Spec §8.7 Comms draft-first: Task 3 + DraftEmailCard.
- Spec §8.8 Listings generator + approval publish: Task 2 + ListingDraft.
- Spec §8.10 Calendar brief + follow-up Task: Task 1 + CalendarWeek.
- Spec §8.11 People timeline = neighborhood: Task 4 + PeopleView.
- Spec §11 step 6 human close: Task 7 demo verification.
- Aggressively scoped to one of each — matches buildathon review note; no TBDs.
