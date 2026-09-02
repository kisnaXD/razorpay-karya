"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type ApiNodeFull,
} from "@/lib/api";
import { formatInr } from "@/lib/format";
import {
  Button,
  DataTable,
  PageHeader,
  StatusDot,
  type Column,
} from "@/components/ui";

type SalesOrderRow = {
  key: string;
  customerOrgKey: string | null;
  customerLabel: string | null;
  promiseDate: string | null;
  invoiceKey: string | null;
  amountInPaise: number | null;
  status: string;
};

type CustomerRow = {
  key: string;
  name: string;
  gstin: string | null;
  outstandingPaise: number;
  lastOrderDate: string | null;
  status: string;
};

type CustomersPageProps = {
  onNavigate: (view: string) => void;
};

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
): number | null {
  const value = props[key];
  return typeof value === "number" ? value : null;
}

function buildCustomerRows(
  orgs: ApiNodeFull[],
  orders: SalesOrderRow[],
  invoices: ApiNodeFull[],
): CustomerRow[] {
  const invoiceByKey = new Map(invoices.map((inv) => [inv.key, inv]));
  const customers = orgs.filter(
    (org) => propString(org.props, "role") === "customer",
  );

  return customers.map((org) => {
    const customerOrders = orders.filter((o) => o.customerOrgKey === org.key);
    let outstandingPaise = 0;
    for (const order of customerOrders) {
      if (!order.invoiceKey) continue;
      const inv = invoiceByKey.get(order.invoiceKey);
      if (!inv) continue;
      const status = propString(inv.props, "status");
      if (status === "overdue" || status === "sent" || status === "open") {
        outstandingPaise += propNumber(inv.props, "amountInPaise") ?? 0;
      }
    }

    const dated = customerOrders
      .map((o) => o.promiseDate)
      .filter((d): d is string => Boolean(d))
      .sort()
      .reverse();

    const statusProp = propString(org.props, "status");
    const status =
      statusProp ??
      (customerOrders.length > 0
        ? outstandingPaise > 0
          ? "open"
          : "active"
        : "inactive");

    return {
      key: org.key,
      name: org.label,
      gstin: propString(org.props, "gstin") ?? propString(org.props, "GSTIN"),
      outstandingPaise,
      lastOrderDate: dated[0] ?? null,
      status,
    };
  });
}

const columns: Column<CustomerRow>[] = [
  {
    key: "name",
    label: "Name",
    sortable: true,
    render: (row) => row.name,
  },
  {
    key: "gstin",
    label: "GSTIN",
    sortable: true,
    width: "140px",
    render: (row) =>
      row.gstin ? (
        <span className="font-mono text-xs">{row.gstin}</span>
      ) : (
        "—"
      ),
  },
  {
    key: "outstandingPaise",
    label: "Outstanding",
    sortable: true,
    align: "right",
    numeric: true,
    width: "120px",
    render: (row) => (
      <span
        className={[
          "font-mono tabular-nums",
          row.outstandingPaise > 0 ? "text-risk" : "",
        ].join(" ")}
      >
        {row.outstandingPaise > 0 ? formatInr(row.outstandingPaise) : "—"}
      </span>
    ),
  },
  {
    key: "lastOrderDate",
    label: "Last order",
    sortable: true,
    width: "120px",
    render: (row) => formatDate(row.lastOrderDate),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    width: "110px",
    render: (row) => (
      <span className="inline-flex items-center gap-2 capitalize">
        <StatusDot status={row.status} size="sm" />
        {row.status}
      </span>
    ),
  },
];

export function CustomersPage({ onNavigate }: CustomersPageProps) {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgsRes, ordersRes, invoicesRes] = await Promise.all([
        api<{ nodes: ApiNodeFull[] }>("/v1/nodes?type=Org"),
        api<{ orders: SalesOrderRow[] }>("/v1/sales/orders"),
        api<{ nodes: ApiNodeFull[] }>("/v1/nodes?type=Invoice"),
      ]);
      setRows(
        buildCustomerRows(orgsRes.nodes, ordersRes.orders, invoicesRes.nodes),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customers");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        (row.gstin?.toLowerCase().includes(q) ?? false) ||
        row.key.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const selected = rows.find((r) => r.key === selectedKey) ?? null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Customers"
        subtitle={`${rows.length} ${rows.length === 1 ? "customer" : "customers"}`}
        trailing={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigate("contacts")}
          >
            People →
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customers…"
          className="h-8 w-full max-w-xs rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 text-sm text-text placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        />
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
          emptyTitle="No customers yet"
          emptyDescription="Customer orgs appear here once they exist on the graph."
        />
      )}

      {selected ? (
        <aside className="absolute inset-y-0 right-0 z-10 flex w-80 flex-col border-l border-line bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-medium text-text">{selected.name}</h2>
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
              <dt className="text-xs text-muted">Key</dt>
              <dd className="mt-0.5 font-mono text-xs">{selected.key}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">GSTIN</dt>
              <dd className="mt-0.5">{selected.gstin ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Outstanding</dt>
              <dd className="mt-0.5 font-mono tabular-nums">
                {selected.outstandingPaise > 0
                  ? formatInr(selected.outstandingPaise)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Last order</dt>
              <dd className="mt-0.5">{formatDate(selected.lastOrderDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Status</dt>
              <dd className="mt-0.5 inline-flex items-center gap-2 capitalize">
                <StatusDot status={selected.status} size="sm" />
                {selected.status}
              </dd>
            </div>
          </dl>
        </aside>
      ) : null}
    </div>
  );
}
