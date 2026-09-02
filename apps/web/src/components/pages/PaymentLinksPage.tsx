"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  apiPost,
  fetchLedger,
  neighborhoodPath,
  type ApiNodeFull,
  type LedgerEntryDto,
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

type PaymentLinkRow = {
  key: string;
  linkId: string;
  invoice: string | null;
  amountPaise: number;
  status: string;
  created: string;
};

type PaymentLinksPageProps = {
  onNavigate: (view: string) => void;
};

const STATUS_FILTERS = [
  "All",
  "Sent",
  "Captured",
  "Expired",
  "Failed",
] as const;

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function propString(
  props: ApiNodeFull["props"],
  key: string,
): string | null {
  const value = props[key];
  return typeof value === "string" ? value : null;
}

function isPaymentLinkEntry(entry: LedgerEntryDto): boolean {
  if (entry.direction !== "in") return false;
  const channel = propString(entry.node.props, "channel");
  if (channel === "payment_link") return true;
  return Boolean(entry.node.props.razorpay_payment_link_id);
}

function linkIdFrom(entry: LedgerEntryDto): string {
  return (
    propString(entry.node.props, "razorpay_payment_link_id") ??
    entry.node.label ??
    entry.node.key
  );
}

async function resolveInvoiceLabel(paymentKey: string): Promise<string | null> {
  try {
    const hood = await api<{
      center: ApiNodeFull;
      nodes: ApiNodeFull[];
    }>(neighborhoodPath(paymentKey, 1));
    const invoice = hood.nodes.find((n) => n.type === "Invoice");
    return invoice?.label ?? invoice?.key ?? null;
  } catch {
    return null;
  }
}

async function buildRows(entries: LedgerEntryDto[]): Promise<PaymentLinkRow[]> {
  const links = entries.filter(isPaymentLinkEntry);
  const invoices = await Promise.all(
    links.map((entry) => resolveInvoiceLabel(entry.node.key)),
  );

  return links.map((entry, i) => ({
    key: entry.node.key,
    linkId: linkIdFrom(entry),
    invoice: invoices[i] ?? null,
    amountPaise: entry.amountInPaise,
    status: entry.status,
    created: entry.at,
  }));
}

const columns: Column<PaymentLinkRow>[] = [
  {
    key: "linkId",
    label: "Link ID",
    sortable: true,
    width: "140px",
    render: (row) => (
      <span className="font-mono text-xs">{row.linkId}</span>
    ),
  },
  {
    key: "invoice",
    label: "Invoice",
    sortable: true,
    width: "120px",
    render: (row) =>
      row.invoice ? (
        <span className="font-mono text-xs">{row.invoice}</span>
      ) : (
        "—"
      ),
  },
  {
    key: "amountPaise",
    label: "Amount",
    sortable: true,
    align: "right",
    numeric: true,
    width: "110px",
    render: (row) => (
      <span className="font-mono tabular-nums">
        {formatInr(row.amountPaise)}
      </span>
    ),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    width: "120px",
    render: (row) => (
      <span className="inline-flex items-center gap-2 capitalize">
        <StatusDot status={row.status} size="sm" />
        {row.status}
      </span>
    ),
  },
  {
    key: "created",
    label: "Created",
    sortable: true,
    width: "130px",
    render: (row) => formatDate(row.created),
  },
];

export function PaymentLinksPage({ onNavigate }: PaymentLinksPageProps) {
  const [rows, setRows] = useState<PaymentLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_FILTERS)[number]>("All");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [invoiceKey, setInvoiceKey] = useState("Invoice:INV-90");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ledger = await fetchLedger();
      setRows(await buildRows(ledger.entries));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load payment links",
      );
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

  async function handleCreate() {
    const key = invoiceKey.trim();
    if (!key) {
      setCreateError("Invoice key is required");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await apiPost("/v1/payment-links", { invoiceKey: key });
      setShowCreate(false);
      await load();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create payment link",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Payment Links"
        subtitle={`${rows.length} ${rows.length === 1 ? "link" : "links"}`}
        trailing={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            + Create Link
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
          emptyTitle="No payment links"
          emptyDescription="Create a link to collect on an open invoice."
        />
      )}

      {selected ? (
        <aside className="absolute inset-y-0 right-0 z-10 flex w-80 flex-col border-l border-line bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-mono text-sm font-medium text-text">
              {selected.linkId}
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
              <dt className="text-xs text-muted">Invoice</dt>
              <dd className="mt-0.5 font-mono text-xs">
                {selected.invoice ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Amount</dt>
              <dd className="mt-0.5 font-mono tabular-nums">
                {formatInr(selected.amountPaise)}
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
              <dt className="text-xs text-muted">Created</dt>
              <dd className="mt-0.5">{formatDate(selected.created)}</dd>
            </div>
          </dl>
          <div className="mt-auto border-t border-line px-4 py-3">
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => onNavigate("ledger")}
            >
              Open ledger
            </Button>
          </div>
        </aside>
      ) : null}

      {showCreate ? (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-link-title"
        >
          <div className="w-full max-w-md rounded-[var(--radius-md)] border border-line bg-surface p-5 shadow-lg">
            <h2
              id="create-link-title"
              className="text-base font-medium text-text"
            >
              Create payment link
            </h2>
            <p className="mt-1 text-sm text-muted">
              Creates a Razorpay payment link for the given invoice key.
            </p>
            <label className="mt-4 block text-xs text-muted" htmlFor="invoice-key">
              Invoice key
            </label>
            <input
              id="invoice-key"
              type="text"
              value={invoiceKey}
              onChange={(e) => setInvoiceKey(e.target.value)}
              className="mt-1 h-8 w-full rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 font-mono text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
            />
            {createError ? (
              <p className="mt-2 text-sm text-risk">{createError}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowCreate(false);
                  setCreateError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                loading={creating}
                onClick={() => void handleCreate()}
              >
                Create Link
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
