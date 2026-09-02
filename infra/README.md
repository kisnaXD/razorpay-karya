# Karya infrastructure

## Current production path (Buildathon)

**Single EC2 + Docker Compose + Caddy** in AWS `ap-south-1`.

| Piece | Choice |
|---|---|
| Compute | `t3.small` Ubuntu 24.04 (bump to `t3.medium` if Playwright worker is on) |
| Proxy | Caddy 2 — TLS when DNS points at the Elastic IP; plain HTTP on `:80` is acceptable for judges |
| Containers | `api` (Fastify :4000), `web` (Next.js standalone :3000), `caddy` (:80/:443) |
| Database | MongoDB Atlas M0/M10 in `ap-south-1`, DB name `karya` |
| Deploy | Manual GitHub Actions `workflow_dispatch` → SSH → `git pull` + `docker compose … up -d --build` |
| Secrets | Host `.env.production` (or SSM later). Never commit secrets. |

See [docs/demo/DEMO.md](../docs/demo/DEMO.md) for bootstrap commands and [`.env.production.example`](../.env.production.example) for the env template.

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

*Agents and API share one graph. External systems write through adapters.*

## When to upgrade to ECS Fargate + ALB

Migrate off EC2 Compose when you need:

- Independent scale of `web` vs `api` (or a dedicated Playwright worker)
- Rolling deploys without SSH
- ALB health checks + target groups instead of a single box
- Secrets Manager / SSM Parameter Store as the source of truth
- CloudWatch log aggregation without Docker journal hacks

Canonical v1 shape from the product spec: **ECS Fargate + ALB + ECR + CDK (TypeScript)**, Atlas stays in `ap-south-1`. DocumentDB / Elastic Beanstalk / Amplify are out of scope.

Optional CDK scaffold may live under `infra/cdk/` later; it is **not** required for the Buildathon demo.

## Tear-down (cost control)

1. `docker compose -f docker-compose.prod.yml down` on the host (or stop/terminate the EC2 instance).
2. Release the Elastic IP if terminating.
3. Atlas: remove the EC2 `/32` network allowlist entry; pause or delete the M0 cluster if unused.
4. Rotate Razorpay **test** key secret and webhook secret after the judging window.
5. Revoke GitHub Actions secrets `EC2_SSH_KEY` / host access when the demo is over.

Target burn: under ₹3,000/month (often near-zero with Atlas M0 + stopped EC2).
