"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type ApiNodeFull } from "@/lib/api";
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
    customer: customerByInvoice.get(inv.key) ?? null,
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
          <Button size="sm" onClick={() => onNavigate("ledger")}>
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
    </div>
  );
}
