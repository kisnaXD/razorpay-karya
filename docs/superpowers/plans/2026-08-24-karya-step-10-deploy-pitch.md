# Karya Step 10 — Deploy, Pitch Video & Public Repo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Karya **publicly demoable** and **submission-ready**: deploy web + API + MongoDB Atlas to AWS `ap-south-1`, add CI that runs tests on every push, write an honest README with architecture and demo instructions, and produce a **5-minute pitch video script** aligned to spec §11. This step ships **no new product features** — only deploy, docs, and polish.

**Architecture (locked for Buildathon):** **Single EC2 + Docker Compose** path as primary (faster than full ECS for a 48-hour finish). Optional **`infra/cdk`** stack documented but not required for done-when. Production: t3.small (or t3.medium if Playwright worker included) in `ap-south-1`, Elastic IP, security group ports 443/80/22, containers for `web`, `api`, optional `worker`. MongoDB Atlas M0/M10 in same region. GitHub Actions: lint, typecheck, test on PR; deploy on `main` tag or manual workflow dispatch. Secrets in AWS SSM Parameter Store (cheaper/simpler than Secrets Manager for demo).

**Tech Stack:** Docker, Docker Compose v2, Node.js 22 Alpine images, nginx or Caddy reverse proxy on EC2, MongoDB Atlas, GitHub Actions, optional AWS CDK TypeScript (scaffold only), `pnpm` CI cache.

## Global Constraints

From spec §10, §11, §13–14 and Steps 1–9.

- **Honesty bar (spec §13):** README says ACP-*inspired*, test-mode Razorpay only, browser fallback to seeded directory, reconciliation match rate if shown must be real.
- **No feature work.** Bug fixes only if deploy reveals blockers. No new agents, routes, or UI modules.
- **Demo must survive cold start.** Seed endpoint disabled in production; use Atlas pre-seeded database snapshot or one-time deploy job.
- **Environment parity.** Production uses same env var names as `.env.example`. Missing optional keys (OpenAI, Resend, Razorpay) degrade gracefully — UI shows designed fallback, not 500.
- **Public repo hygiene.** No `.env`, no Razorpay secrets, no Mongo connection strings in git. `.env.example` complete.
- **Pitch video:** Screen recording + voiceover following locked script below. Architecture slide at end — static PNG or Figma export, not live Mermaid in video.
- **1280×800 minimum** for demo URL; HTTPS preferred (Caddy auto TLS if domain pointed; else Elastic IP HTTP acceptable for judges with README note).
- **Cost cap:** Target < ₹3,000/month (EC2 + Atlas M0 free tier). Tear-down instructions in README.

---

## Deploy path decision (locked)

| Approach | Buildathon role | Done-when required? |
|---|---|---|
| **EC2 + Docker Compose + Caddy** | **Primary** — ship this | **Yes** |
| GitHub Actions → SSH deploy | Primary CI/CD | **Yes** |
| MongoDB Atlas `ap-south-1` | Production DB | **Yes** |
| AWS CDK ECS Fargate + ALB | Documented optional upgrade | **No** (scaffold in repo is bonus) |

Rationale: ECS + ALB + ECR is spec-canonical but overkill for a solo Buildathon finish. EC2 Compose matches “deploy what exists” with hours not days. README lists ECS as v1 path.

---

## File structure (this step creates / modifies)

```
docker-compose.prod.yml              web + api (+ worker) production compose
docker/Dockerfile.api                multi-stage Node 22
docker/Dockerfile.web                Next.js standalone output
docker/Dockerfile.worker             optional Playwright deps
docker/Caddyfile                     reverse proxy :443 → web:3000, /v1 → api:4000
.env.example                         production notes block (modify)
.env.production.example              template for EC2 host (new)

.github/workflows/ci.yml             lint + typecheck + test on PR
.github/workflows/deploy.yml         SSH deploy on workflow_dispatch

scripts/deploy/seed-production.ts    one-time Atlas seed (new)
scripts/deploy/health-check.sh       curl smoke test (new)

infra/README.md                      ECS upgrade path + architecture diagram (new)
infra/cdk/package.json               optional scaffold (new)
infra/cdk/bin/karya.ts               VPC + EC2 or Fargate stub (new)

README.md                            architecture, demo, honesty claims (new or rewrite)
docs/demo/DEMO.md                    judge step-by-step (new)
docs/demo/pitch-script.md            5-min video script (new)
docs/demo/architecture.png             static slide asset (new)

.gitignore                           ensure .env*, *.pem (modify)
```

No changes to `packages/*` business logic except deploy-related env parsing.

---

## Docker images (locked)

### `docker/Dockerfile.api`

- Stage 1: `pnpm install --frozen-lockfile`, build workspace packages, `apps/api` → `dist/`
- Stage 2: `node:22-alpine`, copy `dist`, `node_modules` production, `CMD ["node", "dist/index.js"]`
- Expose `4000`
- Healthcheck: `GET /health`

### `docker/Dockerfile.web`

- Next.js `output: "standalone"` in `apps/web/next.config.ts` (modify if not present)
- Build with `NEXT_PUBLIC_API_URL=` empty (same-origin `/v1` via Caddy proxy)
- CMD `node server.js`, expose `3000`

### `docker-compose.prod.yml`

```yaml
services:
  api:
    build: { dockerfile: docker/Dockerfile.api, context: . }
    environment:
      MONGO_URL: ${MONGO_URL}
      NODE_ENV: production
      WEB_ORIGIN: ${PUBLIC_URL}
      # Razorpay, OpenAI, etc. from host env
    restart: unless-stopped

  web:
    build: { dockerfile: docker/Dockerfile.web, context: . }
    environment:
      NODE_ENV: production
    depends_on: [api]
    restart: unless-stopped

  caddy:
    image: caddy:2-alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./docker/Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    depends_on: [web, api]
    restart: unless-stopped

volumes:
  caddy_data:
```

Caddy routes:

- `{PUBLIC_URL}` → `web:3000`
- `{PUBLIC_URL}/v1/*` → `api:4000`
- `{PUBLIC_URL}/health` → `api:4000/health`

---

## MongoDB Atlas (locked)

1. Create cluster **M0** (or M10 if seed size warrants) in **AWS Mumbai `ap-south-1`**.
2. Database name: `karya`. User: `karya_app` with readWrite.
3. Network access: EC2 Elastic IP `/32` only — not `0.0.0.0/0` in production.
4. **Pre-seed once:** run `scripts/deploy/seed-production.ts` from developer machine against Atlas with `MONGO_URL` — loads Arka Atelier via `seedArkaAtelier`. Disable `POST /v1/admin/seed` when `NODE_ENV=production` (already in Step 1 — verify).
5. Optional: mongodump after seed for backup before demo.

---

## EC2 setup (locked)

| Setting | Value |
|---|---|
| Region | `ap-south-1` |
| Instance | `t3.small` (2 vCPU, 2GB) — bump to `t3.medium` if worker + Playwright |
| AMI | Ubuntu 24.04 LTS |
| Storage | 30GB gp3 |
| Elastic IP | Yes — document in README |
| Security group | Inbound 22 (your IP), 80, 443 |

**Host bootstrap (document in `docs/demo/DEMO.md`):**

```bash
# Docker + Compose v2
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2
sudo usermod -aG docker ubuntu

# Clone repo, copy .env.production from example
git clone https://github.com/<org>/karya.git && cd karya
cp .env.production.example .env.production
# Edit MONGO_URL, RAZORPAY_*, OPENAI_API_KEY, PUBLIC_URL

docker compose -f docker-compose.prod.yml up -d --build
bash scripts/deploy/health-check.sh
```

---

## GitHub Actions CI (locked)

### `.github/workflows/ci.yml`

Triggers: `pull_request`, `push` to `main`.

Jobs:

1. **check** — `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test` (all packages). Node 22.
2. **lint** — `pnpm lint` if configured; skip gracefully if script missing.

No deploy secrets required for CI.

### `.github/workflows/deploy.yml`

Trigger: `workflow_dispatch` only (manual — avoids accidental deploy).

Steps:

1. Checkout
2. `pnpm test` (gate)
3. SSH to EC2: `git pull`, `docker compose -f docker-compose.prod.yml up -d --build`
4. Run `health-check.sh` remotely

Secrets: `EC2_HOST`, `EC2_SSH_KEY`, `EC2_USER=ubuntu`.

---

## README structure (locked)

`README.md` sections — write in this order:

1. **One sentence thesis** (spec §1): graph is memory, agents are operators, human is governor.
2. **Demo URL** + test credentials (`anika@arka.atelier` when auth lands; until then: “open console, data pre-seeded”).
3. **5-minute video link** (YouTube unlisted).
4. **Architecture diagram** (embed `docs/demo/architecture.png`): Web → API → GraphStore/Atlas; agents in API; Razorpay webhooks; optional worker browser.
5. **Stack** — bullet list from spec §10.
6. **Razorpay integration** — test mode, Payment Links, webhooks, honest payout adapter note.
7. **Agent-to-agent commerce** — `/a2a/catalog`, `/a2a/checkout` — **ACP-inspired, not certified**.
8. **Local development** — Docker Mongo, `pnpm dev`, env vars pointer.
9. **Production deploy** — EC2 Compose summary, link `docs/demo/DEMO.md`.
10. **What we did not build** — spec §12 shortened.
11. **License** — MIT (unless repo already differs).

---

## Pitch video script (locked)

File: `docs/demo/pitch-script.md`

**Runtime:** 5:00 ±15s. **Resolution:** 1920×1080 or 1280×800. **Voice:** founder-paced, not hype.

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

**Recording checklist:**

- [ ] Seed data fresh; exceptions visible
- [ ] Razorpay test keys in env; one successful + one failed payment rehearsed
- [ ] Browser demo skipped or shows fallback Event (do not risk live IndiaMART on recording day)
- [ ] Mic check; no background music
- [ ] Export MP4; upload unlisted YouTube; link in README

---

## Architecture slide content (locked)

`docs/demo/architecture.png` — boxes and arrows:

```
[Operator Browser] → [Caddy] → [Next.js Web] + [Fastify API]
                                      ↓
                              [GraphStore / MongoDB Atlas]
                                      ↓
                    [Governor + Tools] ← [Policy Engine]
                                      ↓
              [Razorpay Test]  [Resend?]  [Worker/Browser?]
                                      ↓
                              [External AI Buyer → /a2a]
```

Caption in README: *"Agents and API share one graph. External systems write through adapters."*

---

## Production env template (locked)

`.env.production.example`:

```
PUBLIC_URL=https://karya-demo.example.com
MONGO_URL=mongodb+srv://karya_app:***@cluster.mongodb.net/karya
NODE_ENV=production
WEB_ORIGIN=https://karya-demo.example.com
ORG_ID=org_arka

# Required for full demo
RAZORPAY_KEY_ID=rzp_test_***
RAZORPAY_KEY_SECRET=***
RAZORPAY_WEBHOOK_SECRET=***
OPENAI_API_KEY=sk-***

# Optional
RESEND_API_KEY=
BROWSER_ENABLED=false
PAYOUT_PROVIDER=ledger
```

---

### Task 1: Docker production build

**Files:**
- Create: `docker/Dockerfile.api`, `docker/Dockerfile.web`, `docker-compose.prod.yml`, `docker/Caddyfile`
- Modify: `apps/web/next.config.ts` — `output: "standalone"` if missing

- [ ] **Step 1: Build images locally**

```bash
docker compose -f docker-compose.prod.yml build
```

- [ ] **Step 2: Run against local Mongo — smoke test /**

Expected: web loads, `/v1/bootstrap` returns org_arka.

---

### Task 2: MongoDB Atlas + production seed

**Files:**
- Create: `scripts/deploy/seed-production.ts`, `scripts/deploy/health-check.sh`

- [ ] **Step 1: Create Atlas cluster + user + IP allowlist**

- [ ] **Step 2: Run seed script once**

- [ ] **Step 3: Verify exceptions count ≥ 3 via health-check**

---

### Task 3: EC2 deploy

- [ ] **Step 1: Launch instance, Elastic IP, security group**

- [ ] **Step 2: Clone repo, configure `.env.production`, compose up**

- [ ] **Step 3: Point domain OR document `http://<elastic-ip>` for judges**

- [ ] **Step 4: Register Razorpay webhook URL → `https://<host>/v1/webhooks/razorpay`**

---

### Task 4: GitHub Actions

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`

- [ ] **Step 1: CI passes on clean checkout**

- [ ] **Step 2: Configure repo secrets; manual deploy workflow succeeds**

---

### Task 5: Documentation + public repo hygiene

**Files:**
- Create/rewrite: `README.md`, `docs/demo/DEMO.md`, `docs/demo/pitch-script.md`, `docs/demo/architecture.png`
- Create: `infra/README.md`, optional `infra/cdk` scaffold
- Modify: `.gitignore`, `.env.example`

- [ ] **Step 1: README complete with honesty claims**

- [ ] **Step 2: DEMO.md — judge walkthrough matching pitch script beats**

- [ ] **Step 3: Scan repo for secrets — `git log` / grep keys**

- [ ] **Step 4: Repo public; description + topics set on GitHub**

---

### Task 6: Pitch video

- [ ] **Step 1: Rehearse script twice against production URL**

- [ ] **Step 2: Record screen + VO**

- [ ] **Step 3: Upload unlisted; embed link in README**

---

### Task 7: Optional CDK scaffold (bonus)

**Files:**
- Create: `infra/cdk/` minimal stack — VPC, one Fargate service placeholder, README only

- [ ] **Step 1: `cdk synth` succeeds**

- [ ] **Step 2: `infra/README.md` explains when to migrate from EC2**

Not required for done-when.

---

## Done when

- Public GitHub repo with passing CI on `main`.
- Production URL serves Karya console with pre-seeded Arka data (exceptions visible).
- Razorpay webhooks reach production API; test Payment Link flow works once end-to-end.
- README includes architecture, local setup, demo URL, video link, honest protocol claims.
- `docs/demo/pitch-script.md` committed; video recorded and linked.
- No secrets in git; `.env.example` documents all vars.
- Tear-down steps documented (stop EC2, revoke Atlas IP, rotate Razorpay test keys).

## Out of scope

New features, mobile layout, multi-tenant auth, live payouts, full ECS production cutover, statutory GST export, operator digest email.

---

## Self-review

- Spec §14 item 10: pitch video + README + public repo — entire plan.
- Spec §10 deploy target AWS `ap-south-1` + Atlas — Task 2–3.
- Spec §11 demo narrative — pitch script table matches beats 1–6.
- Spec §13 honesty bar — README structure locked.
- Pragmatic EC2 primary vs CDK optional — matches buildathon scoping note; no TBDs.
- Step 10 explicitly no feature work — Global Constraints.
