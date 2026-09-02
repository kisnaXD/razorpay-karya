"use client";

import { useEffect, useState } from "react";
import { api, apiUrl, type ApiNodeFull, type Bootstrap } from "@/lib/api";
import { formatCash } from "@/lib/format";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  StatusDot,
  type BadgeTone,
} from "@/components/ui";

type IntegrationStatus = {
  id: string;
  name: string;
  detail: string;
  status: "connected" | "optional" | "unknown";
};

function statusTone(status: IntegrationStatus["status"]): BadgeTone {
  if (status === "connected") return "success";
  if (status === "optional") return "warn";
  return "muted";
}

function statusLabel(status: IntegrationStatus["status"]): string {
  if (status === "connected") return "Connected";
  if (status === "optional") return "Env optional";
  return "Unknown";
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="max-w-[60%] break-all text-right text-sm text-text">
        {value}
      </dd>
    </div>
  );
}

export function CompanySettingsPage({
  onNavigate,
}: {
  onNavigate: (view: string) => void;
}) {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [org, setOrg] = useState<ApiNodeFull | null>(null);
  const [apiOk, setApiOk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const envLabel =
    process.env.NODE_ENV === "production" ? "production" : "development";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [boot, health] = await Promise.all([
          api<Bootstrap>("/v1/bootstrap"),
          fetch(apiUrl("/health"))
            .then((r) => r.ok)
            .catch(() => false),
        ]);
        const orgRes = await api<{ node: ApiNodeFull }>(
          `/v1/nodes/${encodeURIComponent(boot.org.key)}`,
        );
        if (cancelled) return;
        setBootstrap(boot);
        setOrg(orgRes.node);
        setApiOk(health);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load company settings",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const role =
    org && typeof org.props.role === "string" ? org.props.role : "merchant";
  const city =
    org && typeof org.props.city === "string" ? org.props.city : null;

  const integrations: IntegrationStatus[] = [
    {
      id: "api",
      name: "Karya API",
      detail: apiOk ? "Health check OK" : "Health check failed",
      status: apiOk ? "connected" : "unknown",
    },
    {
      id: "razorpay",
      name: "Razorpay",
      detail: "Payment links & webhooks when RAZORPAY_* keys are set",
      status: "optional",
    },
    {
      id: "llm",
      name: "LLM Governor",
      detail: "Agent chat when OPENAI_API_KEY is set",
      status: "optional",
    },
    {
      id: "graph",
      name: "Knowledge graph",
      detail: bootstrap
        ? `Org ${bootstrap.org.key} · ${bootstrap.exceptionCount} open exceptions`
        : "Awaiting bootstrap",
      status: bootstrap ? "connected" : "unknown",
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <PageHeader
        title="Company Settings"
        subtitle="Org profile and integration status (read-only)."
        trailing={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigate("policies")}
          >
            Policies →
          </Button>
        }
      />

      {loading ? (
        <p className="px-5 py-6 text-sm text-muted">Loading settings…</p>
      ) : null}

      {!loading && error ? (
        <div className="px-5 py-8">
          <EmptyState
            title="Couldn’t load company settings"
            description={error}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            }
          />
        </div>
      ) : null}

      {!loading && !error && bootstrap ? (
        <div className="space-y-4 px-5 py-5">
          <section className="bg-surface border border-line rounded-[var(--radius-md)] p-4">
            <h2 className="text-md font-medium text-text">Company info</h2>
            <dl className="mt-2 divide-y divide-line">
              <InfoRow label="Name" value={bootstrap.org.label} />
              <InfoRow label="Org ID" value={bootstrap.org.key} />
              <InfoRow label="Type" value={role} />
              <InfoRow label="City" value={city ?? "—"} />
              <InfoRow
                label="Cash balance"
                value={formatCash(bootstrap.cashInPaise)}
              />
            </dl>
          </section>

          <section className="bg-surface border border-line rounded-[var(--radius-md)] p-4">
            <h2 className="text-md font-medium text-text">Integrations</h2>
            <ul className="mt-3 divide-y divide-line">
              {integrations.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-base text-text">{item.name}</p>
                    <p className="mt-0.5 text-sm text-muted">{item.detail}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-2">
                    <StatusDot
                      status={
                        item.status === "connected"
                          ? "ok"
                          : item.status === "optional"
                            ? "pending"
                            : "draft"
                      }
                      size="sm"
                    />
                    <Badge tone={statusTone(item.status)}>
                      {statusLabel(item.status)}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-surface border border-line rounded-[var(--radius-md)] p-4">
            <h2 className="text-md font-medium text-text">General</h2>
            <dl className="mt-2 divide-y divide-line">
              <InfoRow label="Timezone" value="Asia/Kolkata (IST)" />
              <InfoRow label="Currency" value="INR (paise)" />
              <InfoRow label="Locale" value="en-IN" />
              <InfoRow
                label="Exceptions open"
                value={String(bootstrap.exceptionCount)}
              />
            </dl>
          </section>

          <section className="bg-surface border border-line rounded-[var(--radius-md)] p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-md font-medium text-text">Environment</h2>
              <Badge tone={envLabel === "production" ? "risk" : "accent"}>
                {envLabel}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted">
              {envLabel === "production"
                ? "Production build — demo controls are hidden."
                : "Development build — demo webhook controls are available on the ledger."}
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
