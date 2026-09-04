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
  Badge,
  Button,
  DataTable,
  FilterChip,
  PageHeader,
  StatusDot,
  type Column,
} from "@/components/ui";

const INPUT_CLASS =
  "w-full rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-signal";

type SalesOrderRow = {
  key: string;
  customerLabel: string | null;
  invoiceKey: string | null;
};

type InvoiceRow = {
  key: string;
  number: string;
  customer: string | null;
  date: string | null;
  amountPaise: number;
  status: string;
  dueDate: string | null;
};

type InvoicesPageProps = {
  onNavigate: (view: string) => void;
};

const STATUS_FILTERS = [
  "All",
  "Draft",
  "Sent",
  "Paid",
  "Overdue",
] as const;

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN");
}

function propString(
  props: ApiNodeFull["props"],
  key: string,
): string | null {
  const value = props[key];
  return typeof value === "string" ? value : null;
}

function propNumber(
  props: ApiNodeFull["props"],
  key: string,
): number {
  const value = props[key];
  return typeof value === "number" ? value : 0;
}

function invoiceNumber(key: string, label: string): string {
  if (label) return label;
  return key.includes(":") ? (key.split(":")[1] ?? key) : key;
}

function buildInvoiceRows(
  invoices: ApiNodeFull[],
  orders: SalesOrderRow[],
): InvoiceRow[] {
  const customerByInvoice = new Map<string, string>();
  for (const order of orders) {
    if (order.invoiceKey && order.customerLabel) {
      customerByInvoice.set(order.invoiceKey, order.customerLabel);
    }
  }

  return invoices.map((inv) => ({
    key: inv.key,
    number: invoiceNumber(inv.key, inv.label),
    customer:
      customerByInvoice.get(inv.key) ??
      propString(inv.props, "customerOrgKey") ??
      null,
    date: propString(inv.props, "issuedAt") ?? propString(inv.props, "dueAt"),
    amountPaise: propNumber(inv.props, "amountInPaise"),
    status: propString(inv.props, "status") ?? "draft",
    dueDate: propString(inv.props, "dueAt"),
  }));
}

function statusTone(status: string): "risk" | "warn" | "success" | "muted" {
  const s = status.toLowerCase();
  if (s === "overdue") return "risk";
  if (s === "sent" || s === "open") return "warn";
  if (s === "paid") return "success";
  return "muted";
}

const columns: Column<InvoiceRow>[] = [
  {
    key: "number",
    label: "Invoice #",
    sortable: true,
    width: "110px",
    render: (row) => (
      <span className="font-mono text-xs">{row.number}</span>
    ),
  },
  {
    key: "customer",
    label: "Customer",
    sortable: true,
    render: (row) => row.customer ?? "—",
  },
  {
    key: "date",
    label: "Date",
    sortable: true,
    width: "110px",
    render: (row) => formatDate(row.date),
  },
  {
    key: "amountPaise",
    label: "Amount",
    sortable: true,
    align: "right",
    numeric: true,
    width: "110px",
    render: (row) => (
      <span
        className={[
          "font-mono tabular-nums",
          row.status.toLowerCase() === "overdue" ? "text-risk" : "",
        ].join(" ")}
      >
        {formatInr(row.amountPaise)}
      </span>
    ),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    width: "130px",
    render: (row) => {
      const overdue = row.status.toLowerCase() === "overdue";
      return (
        <span className="inline-flex items-center gap-2">
          <StatusDot status={row.status} size="sm" />
          {overdue ? (
            <Badge tone="risk">Overdue</Badge>
          ) : (
            <span className="capitalize">{row.status}</span>
          )}
        </span>
      );
    },
  },
  {
    key: "dueDate",
    label: "Due date",
    sortable: true,
    width: "110px",
    render: (row) => (
      <span
        className={
          row.status.toLowerCase() === "overdue" ? "text-risk" : undefined
        }
      >
        {formatDate(row.dueDate)}
      </span>
    ),
  },
];

export function InvoicesPage({ onNavigate }: InvoicesPageProps) {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_FILTERS)[number]>("All");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [customers, setCustomers] = useState<ApiNodeFull[]>([]);
  const [salesOrders, setSalesOrders] = useState<
    Array<{ key: string; label: string }>
  >([]);
  const [formNumber, setFormNumber] = useState("");
  const [formCustomerKey, setFormCustomerKey] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDueDate, setFormDueDate] = useState("");
  const [formSalesOrderKey, setFormSalesOrderKey] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [invoicesRes, ordersRes] = await Promise.all([
        api<{ nodes: ApiNodeFull[] }>("/v1/nodes?type=Invoice"),
        api<{ orders: SalesOrderRow[] }>("/v1/sales/orders"),
      ]);
      setRows(buildInvoiceRows(invoicesRes.nodes, ordersRes.orders));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoices");
      setRows([]);
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
      api<{
        orders: Array<{ key: string; label: string }>;
      }>("/v1/sales/orders"),
    ])
      .then(([orgsRes, ordersRes]) => {
        if (cancelled) return;
        const custs = orgsRes.nodes.filter(
          (n) => propString(n.props, "role") === "customer",
        );
        setCustomers(custs);
        setSalesOrders(ordersRes.orders);
        setFormCustomerKey((prev) => prev || custs[0]?.key || "");
      })
      .catch(() => {
        if (!cancelled) setFormError("Could not load form options");
      });
    return () => {
      cancelled = true;
    };
  }, [createOpen]);

  const resetCreateForm = () => {
    setFormNumber("");
    setFormCustomerKey("");
    setFormAmount("");
    setFormDueDate("");
    setFormSalesOrderKey("");
    setFormNotes("");
    setFormError(null);
  };

  const onSubmitCreate = async (e: FormEvent) => {
    e.preventDefault();
    const number = formNumber.trim();
    const amountRupees = Number(formAmount);
    if (!number || !formCustomerKey || !Number.isFinite(amountRupees) || amountRupees <= 0) {
      setFormError("Invoice number, customer, and amount are required");
      return;
    }
    if (!formDueDate) {
      setFormError("Due date is required");
      return;
    }

    const amountInPaise = Math.round(amountRupees * 100);
    const dueAt = new Date(formDueDate).toISOString();
    const key = `Invoice:${number}`;

    setSubmitting(true);
    setFormError(null);
    try {
      await createNode({
        type: "Invoice",
        key,
        label: number,
        props: {
          status: "sent",
          amountInPaise,
          dueAt,
          issuedAt: new Date().toISOString(),
          nudge_count: 0,
          collections_state: "awaiting",
          customerOrgKey: formCustomerKey,
          ...(formNotes.trim() ? { note: formNotes.trim() } : {}),
          ...(formSalesOrderKey ? { salesOrderKey: formSalesOrderKey } : {}),
        },
      });
      await createEdge({
        type: "ABOUT",
        fromKey: key,
        toKey: formCustomerKey,
      });
      if (formSalesOrderKey) {
        await createEdge({
          type: "INVOICES",
          fromKey: key,
          toKey: formSalesOrderKey,
        });
      }
      setCreateOpen(false);
      resetCreateForm();
      await load();
      setSelectedKey(key);
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Failed to create invoice",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = useMemo(() => {
    if (statusFilter === "All") return rows;
    const target = statusFilter.toLowerCase();
    return rows.filter((r) => r.status.toLowerCase() === target);
  }, [rows, statusFilter]);

  const selected = rows.find((r) => r.key === selectedKey) ?? null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Invoices"
        subtitle={`${rows.length} ${rows.length === 1 ? "invoice" : "invoices"}`}
        trailing={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              resetCreateForm();
              setCreateOpen(true);
            }}
          >
            + New Invoice
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
          emptyTitle="No invoices yet"
          emptyDescription="Invoices appear when sales orders are billed."
        />
      )}

      {selected ? (
        <aside className="absolute inset-y-0 right-0 z-10 flex w-80 flex-col border-l border-line bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-mono text-sm font-medium text-text">
              {selected.number}
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
              <dd className="mt-0.5">{selected.customer ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Amount</dt>
              <dd className="mt-0.5 font-mono tabular-nums">
                {formatInr(selected.amountPaise)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Status</dt>
              <dd className="mt-0.5">
                <Badge tone={statusTone(selected.status)}>
                  <span className="inline-flex items-center gap-1.5 capitalize">
                    <StatusDot status={selected.status} size="sm" />
                    {selected.status}
                  </span>
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Due date</dt>
              <dd
                className={[
                  "mt-0.5",
                  selected.status.toLowerCase() === "overdue" ? "text-risk" : "",
                ].join(" ")}
              >
                {formatDate(selected.dueDate)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Key</dt>
              <dd className="mt-0.5 font-mono text-xs">{selected.key}</dd>
            </div>
          </dl>
          {selected.status.toLowerCase() === "overdue" ||
          selected.status.toLowerCase() === "sent" ? (
            <div className="mt-auto border-t border-line px-4 py-3">
              <Button
                size="sm"
                className="w-full"
                onClick={() => onNavigate("ledger")}
              >
                Collect payment
              </Button>
            </div>
          ) : null}
        </aside>
      ) : null}

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-invoice-title"
            className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl border border-line bg-surface p-5 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="create-invoice-title"
                  className="text-base font-medium text-text"
                >
                  New Invoice
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Bill a customer for goods or services.
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
                  Invoice Number
                </span>
                <input
                  className={INPUT_CLASS}
                  value={formNumber}
                  onChange={(e) => setFormNumber(e.target.value)}
                  placeholder="INV-100"
                  required
                />
              </label>
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
                  Amount (₹)
                </span>
                <input
                  className={INPUT_CLASS}
                  type="number"
                  min="0"
                  step="0.01"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="25000"
                  required
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted">
                  Due Date
                </span>
                <input
                  className={INPUT_CLASS}
                  type="date"
                  value={formDueDate}
                  onChange={(e) => setFormDueDate(e.target.value)}
                  required
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted">
                  Sales Order (optional)
                </span>
                <select
                  className={INPUT_CLASS}
                  value={formSalesOrderKey}
                  onChange={(e) => setFormSalesOrderKey(e.target.value)}
                >
                  <option value="">None</option>
                  {salesOrders.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label || o.key}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted">
                  Notes
                </span>
                <textarea
                  className={`${INPUT_CLASS} min-h-[72px] resize-y`}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Optional notes"
                />
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
                  {submitting ? "Creating…" : "Create Invoice"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
