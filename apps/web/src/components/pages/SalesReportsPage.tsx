"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatCash, orderStatusTone } from "@/lib/format";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  StatusDot,
  type Column,
} from "@/components/ui";

type OrderBookRow = {
  key: string;
  label: string;
  status: string;
  customerOrgKey: string | null;
  customerLabel: string | null;
  promiseDate: string | null;
  lines: Array<{ skuKey: string; skuLabel: string; qty: number }>;
  invoiceKey: string | null;
  amountInPaise: number | null;
};

function isThisMonth(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function statusToneClass(status: string): string {
  const tone = orderStatusTone(status);
  if (tone === "teal") return "text-teal";
  if (tone === "warn") return "text-warn";
  if (tone === "risk") return "text-risk";
  return "text-muted";
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-line rounded-[var(--radius-md)] p-4">
      <p className="text-sm uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-2 font-mono text-xl font-medium tabular-nums text-text">
        {value}
      </p>
    </div>
  );
}

const orderColumns: Column<OrderBookRow>[] = [
  {
    key: "label",
    label: "Order",
    render: (row) => (
      <span className="font-mono text-sm text-text">{row.label}</span>
    ),
  },
  {
    key: "customerLabel",
    label: "Customer",
    render: (row) => (
      <span className="text-text">{row.customerLabel ?? "—"}</span>
    ),
  },
  {
    key: "amountInPaise",
    label: "Amount",
    align: "right",
    numeric: true,
    render: (row) => (
      <span className="font-mono tabular-nums text-text">
        {row.amountInPaise != null ? formatCash(row.amountInPaise) : "—"}
      </span>
    ),
  },
  {
    key: "status",
    label: "Status",
    render: (row) => (
      <span className="inline-flex items-center gap-2">
        <StatusDot status={row.status} size="sm" />
        <span className={`capitalize ${statusToneClass(row.status)}`}>
          {row.status}
        </span>
      </span>
    ),
  },
];

export function SalesReportsPage({
  onNavigate,
}: {
  onNavigate: (view: string) => void;
}) {
  const [orders, setOrders] = useState<OrderBookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await api<{ orders: OrderBookRow[] }>("/v1/sales/orders");
        if (cancelled) return;
        setOrders(res.orders);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load sales");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const metrics = useMemo(() => {
    // Prefer promise-date-in-month when available; else fall back to all orders for demo volume.
    const scoped =
      orders.filter((o) => isThisMonth(o.promiseDate)).length > 0
        ? orders.filter((o) => isThisMonth(o.promiseDate))
        : orders;

    const withAmount = scoped.filter((o) => o.amountInPaise != null);
    const totalSales = withAmount.reduce(
      (sum, o) => sum + (o.amountInPaise ?? 0),
      0,
    );
    const aov =
      withAmount.length > 0
        ? Math.round(totalSales / withAmount.length)
        : 0;

    const spendByCustomer = new Map<string, { label: string; total: number }>();
    for (const o of orders) {
      if (!o.customerOrgKey || o.amountInPaise == null) continue;
      const prev = spendByCustomer.get(o.customerOrgKey);
      const label = o.customerLabel ?? o.customerOrgKey;
      if (prev) {
        prev.total += o.amountInPaise;
      } else {
        spendByCustomer.set(o.customerOrgKey, {
          label,
          total: o.amountInPaise,
        });
      }
    }
    let topCustomer: string | null = null;
    let topTotal = 0;
    for (const entry of spendByCustomer.values()) {
      if (entry.total > topTotal) {
        topTotal = entry.total;
        topCustomer = entry.label;
      }
    }

    const statusCounts = {
      confirmed: 0,
      shipped: 0,
      delivered: 0,
    };
    for (const o of orders) {
      const s = o.status.toLowerCase();
      if (s === "confirmed" || s === "accepted" || s === "open") {
        statusCounts.confirmed += 1;
      } else if (s === "shipped" || s === "packed") {
        statusCounts.shipped += 1;
      } else if (s === "delivered" || s === "paid" || s === "received") {
        statusCounts.delivered += 1;
      }
    }

    return {
      totalSales,
      aov,
      orderCount: scoped.length,
      topCustomer,
      statusCounts,
    };
  }, [orders]);

  const recent = orders.slice(0, 10);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <PageHeader
        title="Sales Reports"
        subtitle="Read-only analytics from the sales order book."
        trailing={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigate("sales-orders")}
          >
            Orders →
          </Button>
        }
      />

      {loading ? (
        <p className="px-5 py-6 text-sm text-muted">Loading sales reports…</p>
      ) : null}

      {!loading && error ? (
        <div className="px-5 py-8">
          <EmptyState
            title="Couldn’t load sales reports"
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

      {!loading && !error ? (
        <div className="space-y-5 px-5 py-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Total Sales"
              value={formatCash(metrics.totalSales)}
            />
            <KpiCard
              label="Average Order Value"
              value={metrics.aov > 0 ? formatCash(metrics.aov) : "—"}
            />
            <KpiCard label="Orders Count" value={String(metrics.orderCount)} />
            <KpiCard
              label="Top Customer"
              value={metrics.topCustomer ?? "—"}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ["Confirmed", metrics.statusCounts.confirmed, "accent"],
                ["Shipped", metrics.statusCounts.shipped, "warn"],
                ["Delivered", metrics.statusCounts.delivered, "success"],
              ] as const
            ).map(([label, count, tone]) => (
              <div
                key={label}
                className="bg-surface border border-line rounded-[var(--radius-md)] p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm uppercase tracking-wider text-muted">
                    {label}
                  </p>
                  <Badge tone={tone}>{label}</Badge>
                </div>
                <p className="mt-2 font-mono text-xl font-medium tabular-nums text-text">
                  {count}
                </p>
              </div>
            ))}
          </div>

          <section className="bg-surface border border-line rounded-[var(--radius-md)] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-md font-medium text-text">Recent orders</h2>
              <button
                type="button"
                onClick={() => onNavigate("sales-orders")}
                className="text-sm text-signal hover:underline"
              >
                View all →
              </button>
            </div>
            <DataTable
              columns={orderColumns}
              data={recent}
              keyExtractor={(row) => row.key}
              onRowClick={() => onNavigate("sales-orders")}
              emptyTitle="No sales orders"
              emptyDescription="Accepted orders will show up here."
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}
