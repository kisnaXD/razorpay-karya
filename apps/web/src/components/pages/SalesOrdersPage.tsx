"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  api,
  createEdge,
  createNode,
  type ApiNodeFull,
} from "@/lib/api";
import { formatInr } from "@/lib/format";
import {
  Button,
  DataTable,
  FilterChip,
  PageHeader,
  StatusDot,
  type Column,
} from "@/components/ui";

const INPUT_CLASS =
  "w-full rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-signal";

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

const CHANNELS = ["d2c", "wholesale", "marketplace"] as const;

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN");
}

function orderNumber(key: string): string {
  return key.includes(":") ? (key.split(":")[1] ?? key) : key;
}

function propString(
  props: ApiNodeFull["props"],
  key: string,
): string | null {
  const value = props[key];
  return typeof value === "string" ? value : null;
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

export function SalesOrdersPage({ onNavigate: _onNavigate }: SalesOrdersPageProps) {
  const [orders, setOrders] = useState<OrderBookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_FILTERS)[number]>("All");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [customers, setCustomers] = useState<ApiNodeFull[]>([]);
  const [skus, setSkus] = useState<ApiNodeFull[]>([]);
  const [formCustomerKey, setFormCustomerKey] = useState("");
  const [formSkuKey, setFormSkuKey] = useState("");
  const [formQty, setFormQty] = useState("1");
  const [formPromiseDate, setFormPromiseDate] = useState("");
  const [formChannel, setFormChannel] =
    useState<(typeof CHANNELS)[number]>("d2c");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!createOpen) return;
    let cancelled = false;
    Promise.all([
      api<{ nodes: ApiNodeFull[] }>("/v1/nodes?type=Org"),
      api<{ nodes: ApiNodeFull[] }>("/v1/nodes?type=SKU"),
    ])
      .then(([orgsRes, skuRes]) => {
        if (cancelled) return;
        const custs = orgsRes.nodes.filter(
          (n) => propString(n.props, "role") === "customer",
        );
        setCustomers(custs);
        setSkus(skuRes.nodes);
        setFormCustomerKey((prev) => prev || custs[0]?.key || "");
        setFormSkuKey((prev) => prev || skuRes.nodes[0]?.key || "");
      })
      .catch(() => {
        if (!cancelled) setFormError("Could not load form options");
      });
    return () => {
      cancelled = true;
    };
  }, [createOpen]);

  const resetCreateForm = () => {
    setFormCustomerKey("");
    setFormSkuKey("");
    setFormQty("1");
    setFormPromiseDate("");
    setFormChannel("d2c");
    setFormError(null);
  };

  const onSubmitCreate = async (e: FormEvent) => {
    e.preventDefault();
    const qty = Number(formQty);
    if (!formCustomerKey || !formSkuKey) {
      setFormError("Customer and SKU are required");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setFormError("Quantity must be greater than zero");
      return;
    }
    if (!formPromiseDate) {
      setFormError("Promise date is required");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const existing = await api<{ nodes: ApiNodeFull[] }>(
        "/v1/nodes?type=SalesOrder",
      );
      let maxNum = 0;
      for (const order of existing.nodes) {
        const match = /SO-(\d+)/i.exec(order.key);
        if (match) {
          maxNum = Math.max(maxNum, Number.parseInt(match[1]!, 10));
        }
      }
      const soLabel = `SO-${maxNum + 1}`;
      const key = `SalesOrder:${soLabel}`;
      const promiseDate = new Date(formPromiseDate).toISOString();

      await createNode({
        type: "SalesOrder",
        key,
        label: soLabel,
        props: {
          status: "promised",
          promise_date: promiseDate,
          qty,
          orderedAt: new Date().toISOString(),
          channel: formChannel,
        },
      });
      await createEdge({
        type: "BUYS",
        fromKey: formCustomerKey,
        toKey: key,
      });
      await createEdge({
        type: "ORDER_CONTAINS",
        fromKey: key,
        toKey: formSkuKey,
        props: { qty },
      });

      setCreateOpen(false);
      resetCreateForm();
      await load();
      setSelectedKey(key);
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Failed to create sales order",
      );
    } finally {
      setSubmitting(false);
    }
  };

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
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              resetCreateForm();
              setCreateOpen(true);
            }}
          >
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

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-so-title"
            className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl border border-line bg-surface p-5 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="create-so-title"
                  className="text-base font-medium text-text"
                >
                  New Sales Order
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Promise stock to a customer.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCreateOpen(false);
                  resetCreateForm();
                }}
              >
                Close
              </Button>
            </div>

            <form className="space-y-4" onSubmit={onSubmitCreate}>
              <label className="block space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted">
                  Customer
                </span>
                <select
                  className={INPUT_CLASS}
                  value={formCustomerKey}
                  onChange={(e) => setFormCustomerKey(e.target.value)}
                  required
                >
                  <option value="">Select customer…</option>
                  {customers.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted">
                  SKU
                </span>
                <select
                  className={INPUT_CLASS}
                  value={formSkuKey}
                  onChange={(e) => setFormSkuKey(e.target.value)}
                  required
                >
                  <option value="">Select SKU…</option>
                  {skus.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted">
                  Quantity
                </span>
                <input
                  className={INPUT_CLASS}
                  type="number"
                  min="1"
                  step="1"
                  value={formQty}
                  onChange={(e) => setFormQty(e.target.value)}
                  required
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted">
                  Promise Date
                </span>
                <input
                  className={INPUT_CLASS}
                  type="date"
                  value={formPromiseDate}
                  onChange={(e) => setFormPromiseDate(e.target.value)}
                  required
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted">
                  Channel
                </span>
                <select
                  className={INPUT_CLASS}
                  value={formChannel}
                  onChange={(e) =>
                    setFormChannel(e.target.value as (typeof CHANNELS)[number])
                  }
                >
                  {CHANNELS.map((ch) => (
                    <option key={ch} value={ch}>
                      {ch}
                    </option>
                  ))}
                </select>
              </label>

              {formError ? (
                <p className="text-sm text-risk">{formError}</p>
              ) : null}

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCreateOpen(false);
                    resetCreateForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={submitting}
                >
                  {submitting ? "Creating…" : "Create Order"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
