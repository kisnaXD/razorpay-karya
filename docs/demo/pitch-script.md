# Karya — 5-minute pitch script

**Runtime:** 5:00 ±15s  
**Resolution:** 1920×1080 or 1280×800  
**Voice:** founder-paced, not hype  

Aligned to product spec §11.

| Time | Visual | Narration |
|---|---|---|
| 0:00–0:25 | Graph canvas, Arka Atelier, status strip ₹4.2L, 3 exceptions | *"This is Karya — an agentic ERP for a one-person commerce company. The graph is the memory of the business. Agents operate on it. The founder governs."* |
| 0:25–1:05 | Click SO-218 exception; graph path to PO-104, brass material | *"Lotus Boutique needs eight Diya-Large by Friday. Twelve on hand, nine reserved — and the brass sheet PO is four days late. One graph, one story."* |
| 1:05–1:45 | Governor rail: sourcing message; vendor shortlist; draft PO approval | *"The Sourcing agent explains why we need forty kilos of brass, shortlists vendors from our directory, and drafts a PO — gated behind an approval card. Nothing writes without a why."* |
| 1:45–2:30 | Buyer Agent panel; `/a2a` checkout; Payment Link; graph updates | *"Track 01 asks: can an AI buyer purchase from this merchant? Our Buyer Agent queries the agent-readable catalog, checks out on Razorpay test mode, and reserves stock — live on the graph."* |
| 2:30–3:20 | Force payment fail/expire; Inbox red; Money agent proposal; approve retry | *"We force a payment failure. The webhook lands. The Money agent traces impact — invoice, order, stock — and proposes a retry with a forty-eight hour hold. No silent double-charge."* |
| 3:20–3:50 | Calendar brief Thu vendor call; optional email draft flash | *"Before the vendor call, Calendar pulls a prep brief from the same graph — PO late, proposed ask, last message. Comms drafts; the operator sends."* |
| 3:50–4:20 | Policy Studio + audit explorer scroll | *"Every rupee action is bounded by policy, logged in audit, explainable from the graph neighborhood."* |
| 4:20–5:00 | Architecture slide: Mongo graph, Fastify, Razorpay, `/a2a`, EC2 | *"Karya is graph-native agentic commerce — honest about what we implemented, built for the merchant Razorpay already serves. Links in the README."* |

## Recording checklist

- [ ] Seed data fresh; exceptions visible
- [ ] Razorpay test keys in env; one successful + one failed payment rehearsed
- [ ] Browser demo skipped or shows fallback Event (do not risk live IndiaMART on recording day)
- [ ] Mic check; no background music
- [ ] Export MP4; upload unlisted YouTube; link in README

## Claims to avoid on camera

- Do **not** say “ACP-compliant” — say **ACP-inspired**
- Do **not** say production Razorpay / live payouts — **test mode** + ledger payout adapter
- Do **not** imply live marketplace scraping — **seeded directory** / allowlisted fetch with fallback
