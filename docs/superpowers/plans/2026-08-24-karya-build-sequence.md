# Karya — Build sequence

Ordered plans. Each one leaves the product runnable. Do not start the next until the previous plan’s “done when” is true.

| Step | Plan | What you can see / hit when it is done |
|---|---|---|
| 1 | `2026-08-24-karya-step-01-foundation-graph.md` | Monorepo, Mongo graph, Arka Atelier seed, Fastify API, Karya chrome with a real exception inbox |
| 2 | *(write after 1)* Console: XYFlow canvas, inspectors, orders/inventory tables, command palette |
| 3 | Razorpay test-mode adapter, webhooks, Payment Links, audit log |
| 4 | Policy engine + Approval cards + Mandates |
| 5 | Governor + Inventory + Sales tools (promise query, order book) |
| 6 | `/a2a` catalog + checkout + Buyer Agent panel |
| 7 | Money agent + collections loop + forced payment failure |
| 8 | Sourcing agent + browser/search + draft PO |
| 9 | Comms drafts + calendar briefs + listings generator |
| 10 | AWS CDK deploy + pitch video + public repo |

**Standing quality bar (every step):** TypeScript strict. Tests around graph and money. UI from spec tokens only — no shadcn dashboard kit, no Inter, no purple “AI” gradients. Agents never invent schema.

**Do not skip ahead to agents.** A smart model on an empty world is a bad demo.
