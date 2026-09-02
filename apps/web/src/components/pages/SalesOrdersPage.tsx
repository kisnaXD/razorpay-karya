"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatInr } from "@/lib/format";
import {
  Button,
  DataTable,
  FilterChip,
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

type SalesOrdersPageProps = {
  onNavigate: (view: string) => void;
};

const STATUS_FILTERS = [
  "All",
  "Draft",
  "Confirmed",
  "Shipped",
  "Delivered",
  "Cancelled",
] as const;

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN");
}

function orderNumber(key: string): string {
  return key.includes(":") ? (key.split(":")[1] ?? key) : key;
}

function itemsLabel(row: OrderBookRow): string {
  if (row.lines.length === 0) return "—";
  if (row.lines.length === 1) {
    const line = row.lines[0]!;
    return `${line.skuLabel} × ${line.qty}`;
  }
  const totalQty = row.lines.reduce((sum, l) => sum + l.qty, 0);
  return `${row.lines.length} items (${totalQty})`;
}

const columns: Column<OrderBookRow>[] = [
  {
    key: "key",
    label: "Order #",
    sortable: true,
    width: "110px",
    render: (row) => (
      <span className="font-mono text-xs">{orderNumber(row.key)}</span>
    ),
  },
  {
    key: "customerLabel",
    label: "Customer",
    sortable: true,
    render: (row) => row.customerLabel ?? "—",
  },
  {
    key: "promiseDate",
    label: "Date",
    sortable: true,
    width: "110px",
    render: (row) => formatDate(row.promiseDate),
  },
  {
    key: "lines",
    label: "Items",
    render: (row) => (
      <span className="text-sm text-muted">{itemsLabel(row)}</span>
    ),
  },
  {
    key: "amountInPaise",
    label: "Amount",
    sortable: true,
    align: "right",
    numeric: true,
    width: "110px",
    render: (row) => (
      <span className="font-mono tabular-nums">
        {row.amountInPaise != null ? formatInr(row.amountInPaise) : "—"}
      </span>
    ),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    width: "130px",
    render: (row) => (
      <span className="inline-flex items-center gap-2 capitalize">
        <StatusDot status={row.status} size="sm" />
        {row.status}
      </span>
    ),
  },
];

export function SalesOrdersPage({ onNavigate }: SalesOrdersPageProps) {
  const [orders, setOrders] = useState<OrderBookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_FILTERS)[number]>("All");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ orders: OrderBookRow[] }>("/v1/sales/orders");
      setOrders(res.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load orders");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (statusFilter === "All") return orders;
    const target = statusFilter.toLowerCase();
    return orders.filter((o) => o.status.toLowerCase() === target);
  }, [orders, statusFilter]);

  const selected = orders.find((o) => o.key === selectedKey) ?? null;
  const countLabel = `${orders.length} ${orders.length === 1 ? "order" : "orders"}`;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Sales Orders"
        subtitle={countLabel}
        trailing={
          <Button size="sm" onClick={() => onNavigate("customers")}>
            + New Order
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        {STATUS_FILTERS.map((status) => (
          <FilterChip
            key={status}
            active={statusFilter === status}
            onClick={() => setStatusFilter(status)}
          >
            {status}
          </FilterChip>
        ))}
      </div>

      {error ? (
        <div className="flex items-center gap-3 px-5 py-3">
          <p className="text-sm text-risk">{error}</p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : null}

      {loading ? (
        <p className="px-5 py-6 text-sm text-muted">Loading…</p>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={(row) => row.key}
          selectedKey={selectedKey}
          onRowClick={(row) => setSelectedKey(row.key)}
          emptyTitle="No sales orders"
          emptyDescription="Orders appear here once customers place them."
        />
      )}

      {selected ? (
        <aside className="absolute inset-y-0 right-0 z-10 flex w-80 flex-col border-l border-line bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-mono text-sm font-medium text-text">
              {orderNumber(selected.key)}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedKey(null)}
              aria-label="Close"
            >
              ✕
            </Button>
          </div>
          <dl className="space-y-3 overflow-auto px-4 py-4 text-sm">
            <div>
              <dt className="text-xs text-muted">Customer</dt>
              <dd className="mt-0.5">{selected.customerLabel ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Date</dt>
              <dd className="mt-0.5">{formatDate(selected.promiseDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Amount</dt>
              <dd className="mt-0.5 font-mono tabular-nums">
                {selected.amountInPaise != null
                  ? formatInr(selected.amountInPaise)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Status</dt>
              <dd className="mt-0.5 inline-flex items-center gap-2 capitalize">
                <StatusDot status={selected.status} size="sm" />
                {selected.status}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Items</dt>
              <dd className="mt-0.5 space-y-1">
                {selected.lines.length === 0 ? (
                  <span>—</span>
                ) : (
                  selected.lines.map((line) => (
                    <div key={line.skuKey} className="text-sm">
                      {line.skuLabel}{" "}
                      <span className="text-muted">× {line.qty}</span>
                    </div>
                  ))
                )}
              </dd>
            </div>
            {selected.invoiceKey ? (
              <div>
                <dt className="text-xs text-muted">Invoice</dt>
                <dd className="mt-0.5 font-mono text-xs">{selected.invoiceKey}</dd>
              </div>
            ) : null}
          </dl>
        </aside>
      ) : null}
    </div>
  );
}
