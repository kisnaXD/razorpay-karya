#!/usr/bin/env bash
# Smoke test after compose up. Override BASE_URL for remote checks.
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1}"
ORG_ID="${ORG_ID:-org_arka}"

echo "==> GET ${BASE_URL}/health"
curl -fsS "${BASE_URL}/health" | grep -q '"ok"' || {
  echo "health check failed"
  exit 1
}
echo "    ok"

echo "==> GET ${BASE_URL}/v1/nodes (org ${ORG_ID})"
curl -fsS -H "x-org-id: ${ORG_ID}" "${BASE_URL}/v1/nodes" >/dev/null || {
  echo "nodes check failed"
  exit 1
}
echo "    ok"

echo "health-check passed"
