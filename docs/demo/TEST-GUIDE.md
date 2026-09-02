# Karya — Agentic ERP · Test Guide

**App:** Karya — Agentic ERP  
**URL:** http://localhost:3000  
**Demo org:** Arka Atelier — brass diya manufacturer, Jaipur

> **First load:** If the database is empty, the app auto-seeds demo data for **Arka Atelier** on bootstrap. Confirm the sidebar shows "Arka Atelier" and the dashboard loads without errors. API must be running on port **4000**.

**Prerequisites**

- [ ] `pnpm dev` (or web + api running)
- [ ] MongoDB connected
- [ ] `OPENAI_API_KEY` set (required for AI assistant)
- [ ] Optional: `RAZORPAY_*` test keys, `RESEND_API_KEY` for live email

---

## 1. Navigation Tour

Click through every sidebar section. Use **⌘/Ctrl+K** (top-bar search) to reach **Graph** and **Inbox** — they are not in the sidebar.

### Home

- [ ] **Dashboard** — KPI cards (cash, revenue, open orders, exceptions), order book table (SO-218, SO-201), exception list, pending approvals, recent audit events. Click KPIs to navigate.

### Sales

- [ ] **Customers** — Customer orgs from graph (e.g. Lotus Boutique); outstanding amounts, last order dates.
- [ ] **Sales Orders** — SO-218 (`promised`, 8× Diya-Large, Friday promise), SO-201 (`packing`, D2C tray order). Status badges and line items.
- [ ] **Invoices** — INV-90 (`overdue`, ₹14,800, linked to SO-218). Filter by status (Overdue, Sent, Paid).
- [ ] **Payment Links** — plink_7 for INV-90 (`sent` status). Shows Razorpay link metadata when configured.

### Purchases

- [ ] **Vendors** — Meenakshi Brass, Shree Metal Works, Jaipur Alloys; verified-bank badges, cities.
- [ ] **Purchase Orders** — PO-104 (`late`, 40 kg brass sheet, expected ~4 days ago).
- [ ] **Bills** — Vendor bills derived from graph purchase data (may be sparse in seed).

### Inventory

- [ ] **Items** — SKUs: Diya-Large, Cast Blank Diya 5in, Diya-Small, Tray-Oval; prices and GST.
- [ ] **Stock Levels** — Diya-Large @ Workshop (12 on hand, 9 reserved, 40 incoming); Tray-Oval stock.
- [ ] **Movements** — Stock movement history (transfers, reservations).

### Manufacturing

- [ ] **BOMs** — 3 BOMs (see Section 4). List + detail with Components / Operations / Costing tabs.
- [ ] **Work Orders** — 4 work orders (see Section 4). Filters by status; materials and job cards in detail panel.

### Finance

- [ ] **Accounts** — Chart-of-accounts style view from graph/finance nodes.
- [ ] **Ledger** — Cash in (₹4.2L seed), receivables, payables, payment/payout entries.
- [ ] **Audit Log** — Timestamped events (policy evals, approvals, money actions). Filterable.

### CRM

- [ ] **Contacts** — People nodes (Anika, Rafi, Meenakshi procurement contact). Timeline on select.
- [ ] **Organizations** — Org directory (vendors, customers, courier). Timeline filters (message, order, payment, meeting, invoice).

### Reports

- [ ] **Sales Reports** — Order/revenue summaries from graph data.
- [ ] **Inventory Reports** — Stock and material summaries.

### Settings

- [ ] **Company** — Arka Atelier profile (Jaipur), cash position, integration status (API, Razorpay, Resend, OpenAI).
- [ ] **Policies** — Policy Studio with toggles (see Section 5).
- [ ] **Users** — 8 seeded users, roles, permission matrix (see Section 5).

### Operations (Command Palette only)

- [ ] **Graph** — Interactive operations graph: org, orders, PO-104, INV-90, stock, vendors. Click nodes → Node Inspector. Exception highlighting.
- [ ] **Inbox** — Exception cards (stock vs promise, overdue invoice, late PO). Split view with node index; click to focus on graph.

### Shell & Assistant

- [ ] **Sidebar** — Collapse/expand; org label "Arka Atelier"; section accordion.
- [ ] **Top bar** — Breadcrumbs, notification count (exceptions), quick-create/search opens command palette.
- [ ] **Governor Dock** — Bottom assistant bar: collapsed → peek → expanded. Suggested chips: "Check exceptions", "Today's orders", "Review stock levels", "Pending approvals".

---

## 2. AI Assistant Prompts

Open the **Governor Dock** (bottom bar). Each prompt should produce a tool trace and cite node keys. Some actions spawn **Approval cards** — approve or reject before the agent claims success.

### Inventory queries

- [ ] "How much brass sheet do we have?" — Expect material need / reorder context for `Material:BrassSheet-22g`.
- [ ] "Can we fulfill 8 Diya-Large by Friday?" — `inventory_promise_query` for `SKU:Diya-Large`; blockers tied to PO-104.
- [ ] "What's the stock situation for Diya-Large?" — On hand 12, reserved 9, incoming 40 at `Stock:Diya-Large@Workshop`.
- [ ] "Review stock levels" — Overview of key SKUs and shortages.

### Sales queries

- [ ] "Show me the status of SO-218" — Lotus Boutique, 8 units, promised Friday, linked invoice INV-90.
- [ ] "What orders are open today?" / "Today's orders" — Order book: SO-218, SO-201.
- [ ] "Can we quote 10 Diya-Large for Lotus Boutique?" — Draft quote with GST via `sales_generate_quote`.
- [ ] "What's blocking SO-218?" — Graph path to late PO-104 and brass material.

### Sourcing

- [ ] "Do we need to reorder brass sheet?" — `sourcing_explain_need` with reorder point 15 kg and SO-218 demand.
- [ ] "Find brass sheet vendors" — Shortlist: Meenakshi Brass, Shree Metal Works, Jaipur Alloys (directory, not live web).
- [ ] "Draft a PO for 20 kg brass from Meenakshi Brass" — Approval card for `po.create`; preview qty, vendor, estimated total.
- [ ] "Why is PO-104 late?" — Graph neighborhood around `PurchaseOrder:PO-104` and inbound shipment IN-77.

### Communications

- [ ] "Draft an email to Meenakshi Brass about the PO-104 delay" — `comms_draft_email`; Draft Email card appears in dock.
- [ ] "Send a firm follow-up on PO-104" — Draft first; send requires approval (`email.send` policy).

### Calendar

- [ ] "Prepare a brief for Thursday's vendor call" — `calendar_meeting_brief` for `Meeting:VendorCall-Thu` (PO delay, proposed ask, last message).
- [ ] "What do we need to discuss with Meenakshi?" — Meeting context + PO-104 facts.

### Listings

- [ ] "Draft an Instagram listing for the large diya" — `listings_draft_copy` for `SKU:Diya-Large`; title, bullets, hashtags.
- [ ] "Publish the Diya-Large Instagram listing" — Creates approval card (`listing.publish` policy).

### Financial

- [ ] "What invoices are overdue?" — INV-90, ₹14,800, 11+ days past due.
- [ ] "Send a payment link for INV-90" — `money_create_payment_link`; may auto-allow or require approval per policy.
- [ ] "What's our cash position?" — Ledger summary (~₹4.2L cash in seed).
- [ ] "Run collections on overdue invoices" — `money_run_collections_loop` or propose collection for INV-90.

### Graph & exceptions

- [ ] "Check exceptions" — Lists open exception cards (≥3 in seed).
- [ ] "Show me the impact if PO-104 slips another week" — `graph_get_impact` from PO-104.
- [ ] "Find the path from SO-218 to brass sheet" — `graph_find_path` across order → PO → material.

### Approval flows

- [ ] "Pending approvals" — Surfaces any waiting approval cards in the dock.
- [ ] After a draft PO, payment link, email send, or listing publish: **Approve** → agent resumes; **Reject** → action cancelled with reason in thread.
- [ ] Verify tool trace shows `awaiting_approval` → `done` after human decision.

---

## 3. Key Workflows to Test

### Workflow 1: Collections flow

1. [ ] Ask AI: "What invoices are overdue?" → confirms **INV-90** (Lotus Boutique, ₹14,800).
2. [ ] Ask: "Send a payment link for INV-90" → tool `money_create_payment_link`.
3. [ ] If approval required: review Approval card (amount, target invoice, policy eval).
4. [ ] **Approve** → payment link created (or simulated if Razorpay not configured).
5. [ ] Check **Payment Links** page and **Invoices** for updated status.
6. [ ] Optional: Command palette → "Simulate INV-90 payment failure" → verify exception + Money agent recovery proposal.

### Workflow 2: Sourcing flow

1. [ ] Ask: "Do we need brass sheet for SO-218?" → explains shortage vs PO-104 delay.
2. [ ] Ask: "Find brass sheet vendors" → ranked shortlist (Meenakshi, Shree Metal, Jaipur Alloys).
3. [ ] Ask: "Draft a PO for 20 kg from Meenakshi Brass" → approval card with PO preview.
4. [ ] **Approve** → PO drafted; check **Purchase Orders** and **Graph** for new/updated edges.
5. [ ] Optional: **Reject** on a second draft → confirm no write occurs.

### Workflow 3: Communication flow

1. [ ] Ask: "Draft an email to Meenakshi Brass about PO-104 delay".
2. [ ] Review **Draft Email card** in expanded Governor Dock (subject, body).
3. [ ] Click **Send** → creates approval (`email.send` policy always requires approval).
4. [ ] **Approve** → message node updated; with `RESEND_API_KEY`, email sends; without, graph node still records intent.
5. [ ] Check **CRM → Organizations → Meenakshi Brass** timeline for message entry.

### Workflow 4: Policy management

1. [ ] Navigate to **Settings → Policies**.
2. [ ] Review seeded policies: `collect.invoice` (allow), `po.create` (require approval), `email.send` (require approval), `pay.vendor`, `listing.publish`, `money.recovery`.
3. [ ] **Toggle off** `collect.invoice` → save/toggle persists.
4. [ ] Retry "Send payment link for INV-90" → should now require approval instead of auto-allow.
5. [ ] **Toggle back on**; confirm audit log records policy evaluations.

---

## 4. Manufacturing Features

### BOMs (3 seeded)

| BOM No | Item | Status | Notes |
|--------|------|--------|-------|
| BOM-2026-0042 | Diya-Large | Active (default) | 6 components, 3 operations (Buffing, Engraving, QC & Pack), total ~₹238.77 |
| BOM-2026-0038 | Cast Blank Diya 5in | Active (default) | 5 components incl. 0.11 kg brass sheet, 3 ops (Cutting, Casting, Trimming), ~₹148.93 |
| BOM-2026-0045 | Diya-Small-3inch | Draft | 5 components, 2 operations, ~₹120 |

- [ ] List shows all 3 BOMs; filter Active / Draft / Inactive.
- [ ] Select **BOM-2026-0042** → **Components** tab: sub-assembly, consumables, packing lines with rates.
- [ ] **Operations** tab: work centers (Finishing Cell, Engraving Bench, Packing Station), time and operating cost.
- [ ] **Costing** tab: raw material + operation + total cost breakdown.
- [ ] **BOM-2026-0038** links raw brass sheet (`Material:BrassSheet-22g`) — ties to sourcing story.

### Work Orders (4 seeded)

| WO No | Item | Status | Priority | Linked SO |
|-------|------|--------|----------|-----------|
| WO-2026-0187 | Diya-Large | In progress | Urgent | SO-218 |
| WO-2026-0194 | Cast Blank Diya 5in | Not started | Normal | — |
| WO-2026-0156 | Tray-Oval | Completed | Normal | SO-191 |
| WO-2026-0201 | Diya-Small | Draft | Normal | — |

- [ ] **WO-2026-0187**: 320/500 produced; material status `partial` (polish compound low); 3 job cards (Buffing completed, Engraving WIP, QC open).
- [ ] **Materials tab**: required vs transferred vs consumed vs available per line item.
- [ ] **Job cards tab**: JC-442/443/444 with assignees (Fatima B., Anita S.), WIP/completed status.
- [ ] **Costing tab**: planned vs actual material and operation costs.
- [ ] **WO-2026-0194**: `not_started`, brass sheet short 4.2 kg — aligns with PO-104 delay narrative.
- [ ] **WO-2026-0156**: completed with process loss (2 units); all job cards completed.
- [ ] **WO-2026-0201**: draft WO, no job cards yet.

---

## 5. Settings & Admin

### Users & Roles (8 users)

| Name | Email | Role | Status |
|------|-------|------|--------|
| Meenakshi Devi | meenakshi@arkaatelier.in | Administrator | Active |
| Rajesh Gupta | rajesh@arkaatelier.in | Accountant | Active |
| Suresh Yadav | suresh@arkaatelier.in | Storekeeper | Active |
| Ramesh Kumar | ramesh@arkaatelier.in | Shop Supervisor | Active |
| Priya Sharma | priya@arkaatelier.in | Sales | Active |
| Anita Singh | anita@arkaatelier.in | Sales | Invited |
| Vikash Verma | vikash@arkaatelier.in | Shop Supervisor | Active |
| CA Audit | audit@example.com | Viewer | Disabled |

- [ ] User table loads with status filters (All / Active / Invited / Disabled).
- [ ] Click user → role badges and last active timestamps.
- [ ] **Permission matrix** shows modules × actions (read / write / approve) per role:
  - Administrator — full access all modules
  - Accountant — finance write/approve; read elsewhere
  - Storekeeper — purchases + inventory write
  - Shop Supervisor — manufacturing write/approve
  - Sales — sales write; inventory read
  - Viewer — read-only all modules
- [ ] Toggle a user status (e.g. disable) → persists via API.

### Company Settings

- [ ] Org name **Arka Atelier**, city Jaipur, merchant role.
- [ ] Cash position matches bootstrap (~₹4.2L).
- [ ] Integration cards show Connected / Env optional for API, Razorpay, Resend, OpenAI.

### Policies

- [ ] Six policies visible with human-readable rules.
- [ ] Toggle enable/disable per policy; audit trail updates.
- [ ] Mandate chips on approval cards match policy `effect` (allow / require approval / deny).

---

## 6. Known Limitations

- [ ] **Razorpay not configured** — Payment links won't create real Razorpay URLs in test; tool may return simulated/approval-only behavior. Set `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` for test mode.
- [ ] **Email sending requires Resend** — Without `RESEND_API_KEY`, comms writes `Message` graph nodes but does not deliver email. Approval flow still works.
- [ ] **Browser-based vendor search disabled** — `BROWSER_ENABLED=false` by default; `sourcing_browse_public` falls back to seeded vendor directory. Agent should never block on live scrape failure.
- [ ] **Mixed data sources** — Graph nodes drive orders, invoices, exceptions, vendors, stock; **BOMs** and **Work Orders** live in dedicated MongoDB collections (`boms`, `work_orders`); **Users** in `users` collection. Pages may show different freshness/update paths.
- [ ] **OPENAI_API_KEY required** — Without it, Governor Dock shows "Set OPENAI_API_KEY" and agent loop returns 503.
- [ ] **No live bank payouts** — Vendor payouts write ledger/payment nodes; RazorpayX optional, not demo-critical.
- [ ] **A2A buyer endpoint** — `/a2a` catalog/checkout exists for AI buyer demos but is separate from the main ERP sidebar flow.

---

## Quick smoke checklist

- [ ] App loads at localhost:3000, sidebar shows Arka Atelier
- [ ] Dashboard shows exceptions ≥ 3, SO-218 in order book
- [ ] Graph (⌘K) renders nodes; Inbox lists exceptions
- [ ] AI responds to "Check exceptions" with node keys
- [ ] Draft PO creates approval card; approve/reject works
- [ ] BOMs (3) and Work Orders (4) pages load with detail tabs
- [ ] Policies toggle; Users (8) and permission matrix render
