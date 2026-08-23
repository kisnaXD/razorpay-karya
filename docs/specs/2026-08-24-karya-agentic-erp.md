# Karya — Agentic Commerce OS

**Spec status:** Approved for planning (stack locked 2026-08-24)  
**Date:** 2026-08-24  
**Buildathon track:** 01 — AI Growth & Agentic Commerce  
**One sentence:** Karya is an agentic ERP whose system of record is a knowledge graph of the merchant’s whole operation, and whose operators are gated agents that buy, sell, collect, communicate, and plan — with every rupee movement explainable, bounded, and approved.

---

## 1. Why this, not a chatbot

Razorpay’s Track 01 asks for two things at once: **grow a merchant’s revenue**, and **make that merchant transactable by an AI buyer**. Most submissions will be a checkout widget, a catalog API, or a campaign bot. Those are features. They are not a company.

The real bottleneck for the Indian merchant Razorpay actually serves — D2C founders, traders, light manufacturers, 1–15 people — is not “I wish I had another dashboard.” It is that the business lives in five places at once: WhatsApp, Excel, Instagram DMs, Tally, Gmail, a courier panel, a vendor on IndiaMART. Nothing has a memory of anything else. The founder *is* the ERP.

Karya inverts that.

- The **knowledge graph** is the memory of the business.
- The **agents** are the operators that read that memory and act in the world.
- The **human** is the governor: they set policy, approve irreversible actions, and handle exceptions.

If we do this well, the Buildathon demo is not “an agent that can check out.” It is “a merchant that an AI buyer can purchase from, while another agent restocks the SKU, chases the unpaid invoice, and briefs the founder on tomorrow’s vendor call” — all from one graph.

That is agentic commerce as an operating system, not as a widget.

---

## 2. Product thesis

**Traditional ERP:** forms write rows into tables. Humans are the intelligence. Software is the filing cabinet.

**Karya:** every business event is a node. Every causal link is an edge. Agents continuously traverse the graph, propose actions, and — inside policy — execute them. The UI is a viewport onto the graph plus an approval rail, not 200 modules of CRUD.

Three claims we will prove in the demo:

1. **One graph, many jobs.** Orders, inbound vendor shipments, outbound customer shipments, finished-goods inventory, raw-material inventory, the order book, leads, meetings, and messages are the same data model, not separate apps.
2. **Agents do, they do not only answer.** Browse for vendors, draft listings, email/WhatsApp a customer, create a Razorpay Payment Link, propose a payout, open a PO, schedule a follow-up.
3. **Money never moves in the dark.** Every financial action is explainable (why), bounded (policy), gated (human or mandate), audited (append-only log), and has a designed failure path.

---

## 3. Who it is for

**Primary user (Buildathon and v1):** the operator of a small Indian commerce business. Typically a founder or ops lead. Sells D2C and/or B2B. Buys from vendors. Holds inventory. Uses Razorpay today or would.

**Demo company we will ship with:** *Arka Atelier* — a Jaipur brass homeware brand. Buys brass sheet and finishing chemicals (raw materials), converts them into SKUs (finished goods), sells to Instagram/D2C customers and to boutique buyers, ships via Delhivery-style couriers, pays vendors on 15-day terms, collects from boutiques on 30-day invoices. One founder, two workshop people, one freelance photographer. This single story covers every module without feeling fake.

**Not for v1:** multi-entity conglomerates, factory MES, full statutory accounting replacement for a CA, HRIS, or a Shopify-killer storefront. Karya sits *above* those systems later. For the Buildathon it *is* those systems, with synthetic but coherent data.

---

## 4. Approaches we considered

### A. Chat-first ERP
Everything is a conversation. The agent generates forms on demand.

- Fastest to demo.
- Chat is a terrible default for inventory counts, order books, and exceptions.
- Looks like every other LLM wrapper.

### B. Classic ERP + sidecar agent
Zoho/Tally clone with a chatbot that can query it.

- Familiar to judges.
- The graph is bolted on. The agent is a tourist in the database.
- We would spend the whole Buildathon rebuilding CRUD.

### C. Graph-native Agentic OS — **this is the product**
The knowledge graph is the system of record. UI and agents are two clients of the same graph. External systems (Razorpay, email, browser) are tools with adapters that write back into the graph.

- Harder in week one, obviously the right architecture.
- Unique in a room of checkout bots.
- Matches how the founder already thinks: “this vendor is late on the brass that the Diwali order needs, and that boutique still hasn’t paid.”

We are building C. We will steal the *feeling* of chat from A (persistent agent rail) and the *density* of B (tables, when tables are the right viewport).

---

## 5. Design scheme

Karya should feel like a night operations room for a one-person company: calm, dense, expensive, not playful. The graph is always one keystroke away. The agent is always visible. Money is visually distinct from talk.

### 5.1 Personality
- Quiet confidence. No mascots, no purple-gradient “AI” clichés, no emoji as UI.
- The product is the operator’s instrument, like a trading terminal, not a consumer app.
- Indian in substance (INR, GSTIN, UPI, Hinglish-capable copy) and international in craft.

### 5.2 Color
Use these tokens everywhere. Do not invent extra brand colors.

| Token | Hex | Use |
|---|---|---|
| `ink` | `#0C0E12` | App background |
| `surface` | `#14171C` | Panels, cards |
| `surface-2` | `#1B1F26` | Nested wells, graph canvas |
| `line` | `#2A3038` | Hairline borders only |
| `text` | `#E8EAED` | Primary copy |
| `muted` | `#8B919C` | Labels, timestamps, axis text |
| `copper` | `#D4894A` | Agent is thinking / acting. Primary accent. |
| `teal` | `#2DB89A` | Money settled, healthy stock, completed |
| `signal` | `#6B8CFF` | Graph edges, relationships, “connected” |
| `risk` | `#E25D5D` | Overdue, stockout, failed payment, needs you |
| `warn` | `#E0B44A` | Approaching limit, delayed shipment |

Copper = intelligence. Teal = money at rest. Signal = the graph. Risk = the exception inbox. If a screen uses more than two of these at once besides neutrals, it is too loud.

### 5.3 Type
- **Display / product wordmark:** Newsreader (or Fraunces if Newsreader is painful to load). Italic for the word *Karya* only.
- **UI:** IBM Plex Sans. 13px body, 12px meta, 15–16px section titles.
- **Data / IDs / amounts / SKUs / graph IDs:** IBM Plex Mono. Tabular figures for money.
- Never mix a third sans.

### 5.4 Layout — three panes, always

```
┌──────────┬──────────────────────────────┬─────────────────────┐
│  NAV     │  CANVAS                      │  AGENT RAIL         │
│  56px    │  Graph / object / inbox      │  360px              │
│  icons   │                              │  thread + tools     │
│          │                              │  + approval cards   │
├──────────┴──────────────────────────────┴─────────────────────┤
│  STATUS STRIP — cash · exceptions · agent jobs · last sync    │
└───────────────────────────────────────────────────────────────┘
```

- **Left nav (icon rail):** Graph, Inbox, Orders, Inventory, Money, People, Calendar, Listings. Active item in copper. Badge on Inbox = open exceptions.
- **Canvas:** the current viewport. Default landing is **Inbox + graph mini-map**, not an empty chat.
- **Agent rail:** persistent. Collapses to a copper tab on small screens, never disappears. Shows the live thought/tool trace, not a mysterious spinner.
- **Status strip:** cash position (Razorpay test-mode balance + receivables + payables), exception count, running agent jobs.

### 5.5 Signature UI objects

1. **Graph canvas.** Force-directed, dark well. Node types have a single shape each (see §7). Hover a node → incident edges light in `signal`. Click → inspector in the canvas, agent gets that node as context automatically.
2. **Approval card.** The most important component in the product. Copper left edge. Title of the proposed action, amount in mono, “why” in one paragraph pulled from the graph, policy that applies, **Approve / Edit / Reject**. This is how we hit Razorpay’s bar of *explainable, bounded, gated*.
3. **Exception row.** Risk-tinted. “Brass sheet PO-104 is 4 days late and Sales Order SO-218 needs it on Friday.” One click focuses the graph on that subgraph. Agent already has a proposed next action.
4. **Object table.** For order book and inventory, a dense table is correct. Rows are nodes. Selecting a row is selecting a graph node.
5. **Mandate chip.** Small teal/copper pill on any automated action: `policy:pay.vendor ≤ ₹25,000 · approved by Anika · 12 Aug`. AP2-inspired, not a full cryptographic protocol in v1.

### 5.6 Motion
- 120–180ms ease-out on panel changes.
- Graph nodes ease into place; they do not bounce.
- Agent tool calls appear as stacked rows, not typewriter theatrics.
- Approval cards do not animate in a way that could be missed. They are still.

### 5.7 Voice and copy
- The agent speaks like a sharp ops lead: short, specific, numbered when there are choices.
- It may use light Hinglish if the operator does. It never uses slang to sound “AI.”
- Buttons are verbs: `Approve payout`, `Send link`, `Hold order`, `Draft listing`.
- Empty states tell the operator what the agent can do next, not “Nothing here yet.”

---

## 6. The knowledge graph (system of record)

This is the product. If the graph is weak, Karya is a chatbot with extra steps.

### 6.1 Rules
1. Every durable business fact is a **node** with a stable ID, type, timestamps, and a small typed properties bag.
2. Every causal or operational relationship is a **directed, typed edge** with optional properties (`qty`, `role`, `since`).
3. Agents never “remember” operational facts in chat history. They **query the graph**. Chat history is conversation, not truth.
4. External systems write through adapters. Razorpay payment IDs, email message IDs, tracking numbers become properties and edges, not parallel databases.
5. Deletes are rare. We **supersede** (edge `SUPERSEDES`) so the graph can time-travel for audits.

### 6.2 Node types (v1)

| Type | Shape on canvas | What it is |
|---|---|---|
| `Person` | circle | Founder, staff, customer contact, vendor contact |
| `Org` | hexagon | Customer company, vendor, courier, marketplace |
| `SKU` | rounded square | Sellable product |
| `Material` | diamond | Raw material / component |
| `Stock` | small square | On-hand position at a location (qty, reserved, incoming) |
| `Location` | pin | Workshop, packing shelf, 3PL bin |
| `SalesOrder` | chevron right | Customer order |
| `PurchaseOrder` | chevron left | Vendor order |
| `Shipment` | capsule | Inbound or outbound movement |
| `Invoice` | document | Receivable or payable |
| `Payment` | teal disc | Razorpay payment, payout, refund, link |
| `Lead` | ring | Unqualified or in-pipeline demand |
| `Listing` | tag | Public or marketplace offer of a SKU |
| `Meeting` | clock | Call, visit, workshop review |
| `Message` | quote | Email, WhatsApp, Instagram DM (normalized) |
| `Task` | check | Work item the agent or human owns |
| `Policy` | shield | A standing rule the agent must obey |
| `Document` | file | PO PDF, GST invoice, brand photo |
| `Event` | dot | Immutable fact: “payment.failed”, “stock.below_reorder” |

### 6.3 Edge types (v1, keep this list closed)

`OWNS`, `EMPLOYS`, `CONTACT_AT`, `SUPPLIES`, `BUYS`, `HAS_SKU`, `MADE_FROM` (SKU ← Material, with qty), `STOCK_OF`, `LOCATED_AT`, `ORDER_CONTAINS`, `FULFILLS`, `SHIPS`, `INVOICES`, `PAYS`, `PAYS_OUT`, `ABOUT` (Message/Meeting → any), `FOLLOW_UP`, `SOURCED_FROM` (Lead), `LISTS` (Listing → SKU), `GOVERNED_BY` (any action node → Policy), `SUPERSEDES`, `CAUSED` (Event → Event).

If a new fact cannot be expressed with these, we add a type deliberately. We do not let the LLM invent edge names at runtime.

### 6.4 Example subgraph (the demo’s beating heart)

```
Org:Meenakshi Brass  --SUPPLIES--> Material:BrassSheet-22g
PurchaseOrder:PO-104 --ORDER_CONTAINS--> Material:BrassSheet-22g  qty:40kg
Shipment:IN-77 --FULFILLS--> PO-104   (delayed 4d)
SKU:Diya-Large --MADE_FROM--> BrassSheet-22g  qty:0.35kg
Stock:Diya-Large@Workshop --STOCK_OF--> SKU:Diya-Large  on_hand:12 reserved:9
SalesOrder:SO-218 --ORDER_CONTAINS--> SKU:Diya-Large  qty:8
Org:Lotus Boutique --BUYS--> SO-218
Invoice:INV-90 --INVOICES--> SO-218  status:overdue
Payment:plink_7 --PAYS--> INV-90     (link sent, not collected)
Lead:IG-Ananya --SOURCED_FROM--> Listing:Diya-Large-Instagram
Meeting:VendorCall-Thu --ABOUT--> PO-104
```

An agent, asked “what’s at risk this week?”, walks this subgraph and speaks in consequences, not tables.

### 6.5 Storage
- **MongoDB** as the source of truth. Two collections: `nodes` and `edges`. Node `props` and edge `props` are embedded documents, not parallel tables. Append-only `events` live as `Event` nodes, not a third store.
- **Atlas Vector Search** later for “find similar vendors / SKUs / leads.” Step 1 does not store embeddings.
- Graph traversal lives in `GraphStore` (BFS / `$graphLookup` for neighborhood, app-level BFS for path and impact). We do not take Neo4j or Amazon Neptune for the Buildathon.
- Hosting: **MongoDB Atlas on AWS** (`ap-south-1`). Not DocumentDB (incomplete Mongo compatibility). Locally: Docker Official `mongo:8`.

### 6.6 Graph queries the product must support on day one
- Neighborhood(node, depth=2)
- Path(a, b) — why are these two things related?
- Impact(node) — if this PO is late / this SKU stocks out / this invoice fails, what else breaks?
- Exceptions() — nodes whose properties violate a Policy or a derived rule
- TimeSlice(t) — graph as of t (via `valid_from` / `valid_to` on edges)

---

## 7. Agent system

### 7.1 Roles

Karya is not one mega-agent. A **Governor** routes; specialists execute; all of them share the graph and the policy engine.

| Agent | Job | Can touch money? |
|---|---|---|
| **Governor** | Talks to the operator. Breaks work into tasks. Never calls payment APIs itself. | No |
| **Sourcing** | Find vendors (search + browser), compare, draft POs, chase inbound shipments | Propose only |
| **Inventory** | Reorder points, reservations, raw vs finished, “can we take this order?” | No |
| **Sales** | Order book, listings, quotes, AI-buyer catalog, upsell from graph | Propose discounts |
| **Money** | Payment Links, invoices, payouts, refunds, reconciliation against Razorpay | Yes, always gated |
| **Comms** | Email / WhatsApp / listing copy. Draft-first. Sends only with policy or approval | No (except sending a Payment Link it was given) |
| **Calendar** | Meetings, follow-ups, prep briefs pulled from the graph | No |
| **Leads** | Inbound capture, outbound research, pipeline hygiene | No |
| **Buyer-facing** | Public agent-readable catalog + checkout session for AI buyers | Charges via Razorpay, policy-bound |

Specialists are tools from the Governor’s point of view. The operator mostly talks to the Governor.

### 7.2 Tool design
Every tool has:
- a name, JSON schema, and **side-effect class**: `read` | `draft` | `write` | `money` | `external`
- a required **explanation** string the model must fill (the audit “why”)
- a **policy check** that runs *before* execution, not after
- a **graph write** on success or failure (`Event` node + edges)

`money` and irreversible `external` (send email, place a public listing, browser POST that submits a form) require an Approval card unless a standing **Mandate** covers them.

### 7.3 Mandates (AP2-inspired, pragmatic)
A `Policy` node such as:

- `pay.vendor` max ₹25,000 per payout, only to `Org` nodes with `verified_bank = true`, max 3/day
- `collect.invoice` may send Payment Links autonomously for overdue B2B invoices
- `discount` never below 18% gross margin
- `browser` may GET/search; may not enter passwords or bypass logins
- `listing.publish` always needs approval

Mandates are created by the human in plain language; the Governor compiles them into a structured `Policy` the Money/Comms agents must pass. This is our answer to Google AP2 without pretending we implemented the full cryptographic protocol.

### 7.4 Browser and “act on the internet”
The Sourcing and Leads agents may use a **headed-off, sandboxed browser** (Playwright) for public pages: IndiaMART search, vendor about pages, public catalogs, competitor pricing.

Hard rules:
- No credential stuffing, no CAPTCHA farms, no “bypass paywall.”
- Writes (contact forms, listing uploads) are drafted, screenshotted, and parked behind an Approval card.
- Every browse session is an `Event` with URL list stored. The operator can replay what the agent saw.
- For the Buildathon, vendor search can be a mix of live public search and a seeded vendor directory so the demo cannot be killed by a site layout change.

### 7.5 Memory
- **Operational truth:** the graph only.
- **Operator preference:** a small `Person` properties bag (`tone`, `working_hours`, `always_cc`, `default_courier`).
- **Episode memory:** last N tool traces on a Task. Not a second database of facts.

### 7.6 Failure is a feature
Track 01 requires one failure handled gracefully. We design it as a product surface, not a try/catch.

Canonical demo failure: **Payment Link created, customer/boutique payment fails or expires.**

1. Razorpay webhook `payment.failed` / `payment_link.expired` → adapter creates `Event` + updates `Payment`.
2. Money agent classifies: failed vs expired vs cancelled.
3. Impact query: SO-218, INV-90, reserved stock, promised ship date.
4. Governor proposes: retry link, switch to UPI QR, extend reservation 48h, or release stock to the Instagram lead waiting on the same SKU.
5. Operator sees an exception row + approval card. Nothing silent. Nothing double-charges.

A second, quieter failure: **vendor page scrape fails.** Sourcing agent falls back to the seeded directory, logs `Event:browse.failed`, and still produces a shortlist. The demo never dies on the internet.

---

## 8. Feature map

Legend: **MVP** ships for the Buildathon demo. **v1** is the product after the demo, still the same architecture. **Later** is on the roadmap so we do not pretend the ERP is finished.

### 8.1 Graph & operator console — MVP
- Auth (one org, a few users), seeded Arka Atelier dataset
- Graph canvas + inspector
- Object tables for orders, inventory, people
- Inbox of exceptions
- Persistent Governor rail with visible tool trace
- Status strip: cash, exceptions, jobs

### 8.2 Sell side (this is Track 01) — MVP
- SKU catalog with price, GST rate, stock, images, materials
- **Agent-readable catalog** at `GET /a2a/catalog` — structured JSON an external AI buyer can consume (ACP-inspired; we implement a thin, honest subset: products, offer, availability, not the full Stripe/OpenAI spec)
- **Agent checkout session** `POST /a2a/checkout` — creates SalesOrder + Razorpay Order/Payment Link in test mode, reserves stock, writes graph
- Human storefront is *not* required. A “Buyer Agent” panel in the demo simulates ChatGPT/UAP buying from Arka
- Upsell/cross-sell: Sales agent proposes add-ons from `MADE_FROM` / frequently-co-ordered edges
- Order book: open / reserved / packed / shipped / cancelled

### 8.3 Buy side — MVP
- Materials + vendors + POs
- Sourcing agent: shortlist vendors for a material that is below reorder, with quotes if present
- Draft PO from the graph (“we need 40kg brass sheet because SO-218 + reorder point”)
- Inbound shipment tracking as manual status updates plus seeded delay events. No live courier API in MVP.

### 8.4 Inventory — MVP
- Dual inventory: `Material` and `SKU`
- On-hand, reserved, incoming, reorder point, reorder qty
- **Promise query:** “Can I accept an order for 8× Diya-Large for Friday?” → yes / yes-if-PO-arrives / no, and why (graph impact)
- Raw material explosion via `MADE_FROM`

### 8.5 Money (Razorpay test mode) — MVP
- Create Payment Link on an Invoice
- Razorpay Orders + webhook ingestion
- Propose vendor payout: same Approval card + audit path as collections. `PayoutAdapter` is a real interface. MVP ships a `LedgerPayoutProvider` that writes `Payment` nodes without hitting a bank. If `RAZORPAYX_KEY_ID` is present, `RazorpayXProvider` is swapped in with no UI change. Collect-side Razorpay Payment Links are always live test-mode — we do not fake inbound money.
- Refund proposal on a failed fulfillment
- Ledger view: payments in, payouts out, fees if present
- **Reconciliation:** 50+ synthetic Razorpay-like events matched to Invoices/POs, with an honest exception list (this also covers Track 04’s spirit without switching tracks)

### 8.6 Collections / revenue recovery — MVP (one loop)
- Detect overdue INV-90
- Send Payment Link + a Comms draft (email)
- On fail/expire, the failure path in §7.6
- Stopping rules: max 3 nudges, then escalate to Inbox, never spam

### 8.7 Communications — MVP
- Unified `Message` nodes
- Draft email to vendor or customer, operator hits send (or mandate auto-sends collections)
- WhatsApp: seeded threads rendered in the People timeline. Live WhatsApp Cloud API is v1, not MVP.
- All sent messages `ABOUT` the relevant order/invoice/meeting

### 8.8 Listings — MVP
- Internal listing object (title, bullets, price, images, channel)
- Sales agent generates listing copy from SKU + materials + past Messages
- “Publish” is an Approval. For demo, publish target is Karya’s own public catalog (which the Buyer Agent reads). IndiaMART/Instagram publish is mocked with a screenshot + payload

### 8.9 Leads — MVP
- Inbound lead from the Buyer Agent or a seeded Instagram DM
- Lead → quote → SalesOrder conversion writes the right edges
- Leads agent can research a boutique (public web) and attach a brief to the `Org`

### 8.10 Calendar & meetings — MVP (thin)
- `Meeting` nodes on a week view
- Agent prep brief: “Thu 4pm, Meenakshi Brass, PO-104 late, brass needed for SO-218, last message 2 days ago, proposed ask: air the remaining 15kg”
- Create follow-up `Task` from a meeting

### 8.11 People / CRM — MVP
- `Person` / `Org` with roles: customer, vendor, courier, staff
- Timeline = neighborhood of Messages, Orders, Payments, Meetings

### 8.12 Policy studio — MVP
- List of Policies in plain language + compiled JSON
- Toggle, edit, see which actions a policy has allowed/blocked
- This is the “Agent Studio” analog, scoped to commerce + money

### 8.13 Features people forget (all MVP except digest)
- **What-if.** “If Lotus Boutique cancels, who gets the reserved diyas?” Same impact query as Inventory. MVP.
- **Audit explorer.** Filter by actor (human/agent), side-effect class, rupee amount. MVP, required for judges.
- **Idempotency keys** on every Razorpay call. MVP.
- **Human override.** Any agent Task can be taken over; the graph still records who did it. MVP.
- **Operator digest.** Morning summary. v1 — the Inbox plus status strip already cover the pitch.

### 8.14 v1 (after Buildathon, same codebase)
- Live WhatsApp Business
- RazorpayX real payouts
- GSTIN validation, e-invoice export
- Multi-warehouse
- Role-based access beyond founder/staff
- Connect Gmail as a Message adapter
- Campaigns (Track 01 example) driven by graph segments
- Tally/Zoho Books export

### 8.15 Later
- Full statutory books (we are not replacing the CA)
- Manufacturing execution (BOMs deeper than `MADE_FROM`, shop-floor)
- HR, payroll
- Multi-entity
- True ACP/UCP/AP2/x402 protocol compliance as those specs freeze
- Voice recovery (Track 03 example) in Hinglish

---

## 9. Razorpay integration (non-negotiable)

We submit on **Track 01**. We use **test-mode APIs**. We do not fake a payment that we could have made real in test mode.

### 9.1 What we call
- Customers (or our own `Org` mapped to Razorpay customer id)
- Orders
- Payment Links (primary collect path for B2B invoices and AI-buyer checkout)
- Payments fetch + refunds
- Webhooks: `payment.captured`, `payment.failed`, `payment_link.paid`, `payment_link.expired`, `refund.processed`

We do not call Razorpay Invoices, QR, or UPI APIs in MVP. Our `Invoice` nodes plus Payment Links are the collect path.

Payouts: graph objects (`Contact`, `FundAccount`, `Payout`) plus the `PayoutAdapter` in §8.5. Approval cards and the audit log are identical whether the ledger provider or RazorpayX is behind the adapter. Inbound money is always a real Razorpay test-mode Payment Link.

### 9.2 The bar, mapped to screens
| Razorpay bar | Karya surface |
|---|---|
| Explainable | Approval card “why” + graph neighborhood screenshot |
| Bounded | Policy studio + mandate chips |
| Gated | Approve / Edit / Reject; Money agent cannot skip this |
| Audit trail | Audit explorer + `Event` nodes |
| One failure handled | Payment failed/expired loop in Inbox |

### 9.3 Agent-to-agent commerce
We implement an internal protocol that is *honestly described* as ACP-inspired:

```
GET  /a2a/catalog              → SKUs, prices, availability, GST, images
POST /a2a/checkout/sessions    → session with line items, totals, fulfillment
POST /a2a/checkout/sessions/:id/complete → Razorpay test payment + SalesOrder
GET  /a2a/orders/:id           → status for the buyer agent
```

A panel in the app, **Buyer Agent**, plays the role of an external AI shopper: “Find a large brass diya under ₹2,000 that can ship this week.” It hits `/a2a/*`. That is the “make the merchant sellable to AI buyers” proof.

We do not claim we certified against OpenAI ACP or NPCI UAP. We claim we implemented the merchant-side shape those protocols need, settled on Razorpay.

---

## 10. Application architecture

```
                    ┌──────────────┐
                    │  Next.js UI  │  three panes, graph canvas
                    └──────┬───────┘
                           │ REST (JSON)
                    ┌──────▼───────┐
                    │ Node.js API  │  Fastify, auth, webhooks, /a2a
                    └──────┬───────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   ┌───────────┐    ┌────────────┐    ┌────────────┐
   │ GraphStore│    │ Policy     │    │ Agent host │
   │ MongoDB   │    │ engine     │    │ Governor + │
   │ Atlas     │    │            │    │ specialists│
   └───────────┘    └────────────┘    └─────┬──────┘
                                            │ tools
                     ┌──────────────────────┼────────────┐
                     ▼                      ▼            ▼
              Razorpay test          Browser sandbox   Comms
              Orders, Links,         Playwright        email adapter
              webhooks               (public GET)
```

**Stack (locked):**
- Language: TypeScript 5.8, strict, Node.js 22
- Frontend: Next.js 15 App Router, Tailwind, XYFlow (React Flow) from step 2, primitives we own — no generic shadcn dashboard kit
- API: Fastify 5 on Node.js (`apps/api`). Next.js does not own business routes
- Worker: same Fastify codebase, `apps/worker`, for agents, webhooks, Playwright (from later steps)
- DB: MongoDB 8. Local Docker; production = Atlas on AWS `ap-south-1`
- Agents: Vercel AI SDK tool loop (later steps). One strong model for Governor
- Queue: MongoDB-backed jobs collection. No Redis in MVP
- Email: Comms adapter always writes a `Message` node. If `RESEND_API_KEY` is set, it also sends
- Browser: Playwright in the worker, domain allowlist
- Auth: Auth.js on the web app, API verifies the session JWT. Seeded operator `anika@arka.atelier` (auth lands in a later step; step 1 is a single-org header)
- Deploy: AWS `ap-south-1`. ECS Fargate + ALB for `web` and `api`, ECR, Secrets Manager, CloudWatch, GitHub Actions, AWS CDK in TypeScript. MongoDB Atlas in the same region. Not DocumentDB, not Elastic Beanstalk, not Amplify

**Repo shape:**
```
apps/web                 Next.js UI
apps/api                 Fastify GraphStore HTTP
apps/worker              agents, webhooks, browser (later)
packages/graph           nodes, edges, queries
packages/seed            Arka Atelier world
packages/tokens          color, type, spacing as CSS + TS
packages/agents          governor, specialists, tools (later)
packages/policy          mandates, evaluation (later)
packages/razorpay        adapters (later)
packages/a2a             catalog + checkout (later)
infra/                   AWS CDK (later)
```

---

## 11. Demo narrative (5 minutes, the pitch video)

We script the video to this sequence. If a feature is not in this sequence, it is not MVP.

1. **Cold open on the graph.** Arka Atelier. Founder Anika. Copper agent rail idle. Status strip: ₹4.2L Razorpay test balance, 3 exceptions.
2. **Exception one: stock vs order.** SO-218 (Lotus Boutique, 8× Diya-Large) is promised Friday. Inventory agent: 12 on hand, 9 reserved, brass PO-104 late. Promise query says *yes-if*. Graph lights up the path.
3. **Agent acts on the buy side.** Sourcing agent shortlists two brass vendors (one live fetch, one seeded). Draft PO. Approval card. Anika approves. Inbound `Shipment` node appears as incoming stock.
4. **AI buyer arrives.** Switch to Buyer Agent: “large brass diya under ₹2000, this week.” Hits `/a2a/catalog`, creates checkout, Razorpay Payment Link in test mode. SalesOrder + stock reservation appear on the graph in real time. *Merchant is sellable to an AI buyer.*
5. **Money failure.** We force-expire or fail the boutique’s Payment Link. Webhook lands. Inbox goes red. Money agent explains impact, proposes a new link and a 48h stock hold vs releasing to the Instagram lead. Anika approves the retry. Audit explorer shows the full trace.
6. **Human close.** Thursday meeting brief auto-generated for the vendor call. Digest: what the agents did overnight. Cut to architecture slide: graph, policy, Razorpay, `/a2a`.

Five minutes. No feature tourism.

---

## 12. What we will not do in the Buildathon

- Rebuild Tally, Shopify, or SAP.
- Unattended browser posting to real marketplaces.
- Live bank payouts in production.
- Training our own model.
- Multi-tenant billing for Karya itself (we are the product, not the SaaS go-to-market).
- Pixel-perfect mobile app. The web app must work at 1280px and be usable at 768px. Phone is later.
- Letting the LLM invent graph schema.

---

## 13. Success criteria

**Judges (Track 01):**
- A merchant an AI buyer can actually check out with, on Razorpay test mode
- At least one autonomous revenue action (collect, upsell, or accept an inbound AI order)
- Every rupee action gated, explained, audited
- One failure path that does not corrupt stock or double-charge

**Us:**
- Seeded world is coherent; clicking any node tells a true story
- Agent can answer “why is this late / who owes us / can we take this order?” from the graph alone
- A stranger can watch the 5-minute video and repeat the thesis: *graph is memory, agents are operators, human is governor*

**Honesty bar:**
- If a protocol is “inspired by ACP,” the README says inspired.
- Match rate on reconciliation is a real number on held-out synthetic events, not a cherry-pick.
- Browser demos have a fallback so live internet cannot zero the pitch.

---

## 14. Build order (after this spec is approved)

1. GraphStore + seed world (Arka Atelier must be interesting before any LLM is wired)
2. Console shell: three panes, graph canvas, object tables, Inbox
3. Razorpay adapter + webhooks + Payment Links + audit log
4. Policy engine + Approval cards
5. Governor + Inventory + Sales tools (promise query, order book)
6. `/a2a` catalog + checkout + Buyer Agent panel
7. Money agent + collections loop + forced failure
8. Sourcing agent + browser/search + draft PO
9. Comms drafts + Calendar briefs + Listings generator
10. Pitch video + architecture README + public repo hygiene

Do not start agents before the graph and the seed world are good. A smart agent on a stupid world is a bad demo.

---

## 15. Open decisions (need you)

These are the only product decisions that should change this spec. Everything else is a recommendation you can override.

1. **Name.** Karya is the working name (Sanskrit/Hindi for *work*). Change now if you hate it.
2. **Demo vertical.** Brass homeware (Arka Atelier) gives us raw materials + finished goods + D2C + B2B in one story. A pure D2C skincare brand is simpler but weaker on raw-material inventory.
3. **Track.** We submit Track 01. We borrow proof points from recovery and finance, but we do not split focus across submissions.
4. **How far the browser goes.** MVP = public search + screenshots + drafted actions. Not live form-submit to third parties.

Stack, name, vertical, and track are locked. Implementation is sequenced in `docs/superpowers/plans/`. Step 1 is `2026-08-24-karya-step-01-foundation-graph.md`.
