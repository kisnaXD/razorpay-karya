# Karya — judge / operator demo walkthrough

Aligned to the [pitch script](./pitch-script.md) and product spec §11. Runtime ~5 minutes. Prefer the **production URL** with Atlas pre-seeded; local Docker Mongo + `pnpm dev` works for rehearsal.

**Honesty reminders:** Razorpay is **test mode**. `/a2a` is **ACP-inspired**, not certified. Sourcing browser falls back to a **seeded vendor directory** — do not depend on live IndiaMART during judging.

---

## Before you start

1. Open the demo URL from the README (or `http://localhost:3000`).
2. Confirm status strip shows cash + **≥3 exceptions**.
3. Confirm Razorpay test keys are configured if you will run Payment Link / fail paths.
4. Optional: Buyer Agent panel ready; Policy Studio + Audit Explorer reachable from nav.

---

## Beat 1 — Cold open (0:00–0:25)

1. Land on the **graph canvas** for **Arka Atelier**.
2. Point at the status strip (cash position, exception count).
3. Agent rail idle — human is governor, agents wait.

**Say:** graph is memory, agents operate, founder governs.

---

## Beat 2 — Exception: stock vs order (0:25–1:05)

1. Open Inbox / exceptions → select **SO-218** (Lotus Boutique, Diya-Large).
2. On the graph, follow the path to inventory and **PO-104** (brass, late).
3. Read the promise story: on hand vs reserved vs Friday need.

**One graph, one story** — no tab hopping across Excel / WhatsApp.

---

## Beat 3 — Sourcing + approval (1:05–1:45)

1. In the Governor / agent rail, trigger or show the **Sourcing** thread (brass need).
2. Show vendor shortlist (directory / fallback — not a live scrape dependency).
3. Show **draft PO** as an **Approval card** — Approve / Edit / Reject.
4. Approve; note the graph update (incoming stock / PO edge).

**Nothing writes without a why.**

---

## Beat 4 — AI buyer + `/a2a` (1:45–2:30)

1. Open **Buyer Agent** panel.
2. Ask for a large brass diya under ₹2000 this week.
3. Show catalog hit (`GET /a2a/catalog`) and checkout (`POST /a2a/checkout`).
4. Payment Link opens in **Razorpay test mode**; SalesOrder + stock reservation appear on the graph.

**Merchant is sellable to an AI buyer.**

---

## Beat 5 — Payment failure + Money agent (2:30–3:20)

1. Force fail / expire a Payment Link (dev simulate webhook, or Razorpay test failure).
2. Inbox goes red; Money agent impact copy (invoice, order, stock).
3. Approve **retry** with a **48h hold** — no silent double-charge.
4. Optional: open **Audit Explorer** for the trace.

---

## Beat 6 — Calendar + policy close (3:20–5:00)

1. Open **Calendar** — Thursday vendor call brief (PO late, ask, last message).
2. Flash **Comms** draft if time allows (operator sends — agent drafts).
3. **Policy Studio** + audit scroll — rupee actions bounded and logged.
4. Cut to [architecture](./architecture.png) / README architecture section.

---

## Host bootstrap (production)

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
sudo usermod -aG docker ubuntu
# re-login for docker group

git clone <repo-url> ~/karya && cd ~/karya
cp .env.production.example .env.production
# Edit MONGO_URL, PUBLIC_URL, WEB_ORIGIN, RAZORPAY_*, OPENAI_API_KEY

# One-time from a laptop with Atlas access:
# MONGO_URL='…' pnpm exec tsx scripts/deploy/seed-production.ts

docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
BASE_URL=http://127.0.0.1 bash scripts/deploy/health-check.sh
```

Register Razorpay webhook (test): `https://<host>/v1/webhooks/razorpay` (or `http://` on Elastic IP).

GitHub Actions deploy: Actions → **Deploy** → Run workflow. Repo secrets: `EC2_HOST`, `EC2_SSH_KEY`, `EC2_USER` (e.g. `ubuntu`). Clone path on host: `~/karya`.

---

## Tear-down

See [README](../../README.md#tear-down) and [infra/README.md](../../infra/README.md).
