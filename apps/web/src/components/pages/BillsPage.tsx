"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type ApiEdge,
  type ApiNodeFull,
} from "@/lib/api";
import { formatInr } from "@/lib/format";
import { loadGraphSnapshot } from "@/lib/graph-data";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  FilterChip,
  PageHeader,
  StatusDot,
  type Column,
} from "@/components/ui";

type BillFilter = "all" | "unpaid" | "paid" | "overdue";

type BillRow = {
  key: string;
  billNumber: string;
  vendor: string;
  poReference: string;
  amountPaise: number | null;
  status: Exclude<BillFilter, "all">;
  statusLabel: string;
  dueDate: string | null;
};

const FILTERS: { id: BillFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unpaid", label: "Unpaid" },
  { id: "paid", label: "Paid" },
  { id: "overdue", label: "Overdue" },
];

function shortKey(key: string): string {
  return key.includes(":") ? key.split(":")[1]! : key;
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function normalizeBillStatus(raw: string): Exclude<BillFilter, "all"> {
  const s = raw.toLowerCase();
  if (s === "paid" || s === "captured" || s === "settled") return "paid";
  if (s === "overdue" || s === "late") return "overdue";
  return "unpaid";
}

function statusDotToken(status: Exclude<BillFilter, "all">): string {
  switch (status) {
    case "paid":
      return "paid";
    case "overdue":
      return "overdue";
    case "unpaid":
      return "open";
  }
}

function statusLabel(status: Exclude<BillFilter, "all">): string {
  switch (status) {
    case "paid":
      return "Paid";
    case "overdue":
      return "Overdue";
    case "unpaid":
      return "Unpaid";
  }
}

/** Purchase bills = Invoice nodes linked to a PurchaseOrder (not SalesOrder). */
function buildPurchaseBillRows(
  invoices: ApiNodeFull[],
  nodes: ApiNodeFull[],
  edges: ApiEdge[],
): BillRow[] {
  const nodeById = new Map(nodes.map((n) => [n._id, n]));
  const rows: BillRow[] = [];

  for (const inv of invoices) {
    const invoiceEdges = edges.filter(
      (e) =>
        (e.type === "INVOICES" || e.type === "BILLS") &&
        (e.fromId === inv._id || e.toId === inv._id),
    );

    let po: ApiNodeFull | null = null;
    for (const edge of invoiceEdges) {
      const otherId = edge.fromId === inv._id ? edge.toId : edge.fromId;
      const other = nodeById.get(otherId);
      if (other?.type === "PurchaseOrder") {
        po = other;
        break;
      }
    }

    if (!po) continue;

    let vendor = "—";
    const contact = edges.find(
      (e) => e.type === "CONTACT_AT" && e.toId === po!._id,
    );
    if (contact) {
      vendor = nodeById.get(contact.fromId)?.label ?? "—";
    } else if (typeof po.props.vendor_key === "string") {
      const v = nodes.find((n) => n.key === po!.props.vendor_key);
      vendor = v?.label ?? shortKey(po.props.vendor_key);
    }

    const status = normalizeBillStatus(String(inv.props.status ?? "unpaid"));
    const dueRaw =
      typeof inv.props.dueAt === "string" ? inv.props.dueAt : null;

    rows.push({
      key: inv.key,
      billNumber: shortKey(inv.key),
      vendor,
      poReference: shortKey(po.key),
      amountPaise:
        typeof inv.props.amountInPaise === "number"
          ? inv.props.amountInPaise
          : null,
      status,
      statusLabel: statusLabel(status),
      dueDate: formatDate(dueRaw),
    });
  }

  rows.sort((a, b) => {
    if (a.status === "overdue" && b.status !== "overdue") return -1;
    if (b.status === "overdue" && a.status !== "overdue") return 1;
    return a.billNumber.localeCompare(b.billNumber);
  });

  return rows;
}

const columns: Column<BillRow>[] = [
  {
    key: "billNumber",
    label: "Bill #",
    sortable: true,
    width: "100px",
    render: (row) => (
      <span
        className={[
          "font-mono text-xs",
          row.status === "overdue" ? "text-risk" : "",
        ].join(" ")}
      >
        {row.billNumber}
      </span>
    ),
  },
  {
    key: "vendor",
    label: "Vendor",
    sortable: true,
    render: (row) => row.vendor,
  },
  {
    key: "poReference",
    label: "PO Reference",
    sortable: true,
    width: "110px",
    render: (row) => (
      <span className="font-mono text-xs">{row.poReference}</span>
    ),
  },
  {
    key: "amountPaise",
    label: "Amount",
    sortable: true,
    width: "110px",
    align: "right",
    numeric: true,
    render: (row) =>
      row.amountPaise !== null ? (
        <span
          className={[
            "font-mono tabular-nums",
            row.status === "overdue" ? "text-risk" : "",
          ].join(" ")}
        >
          {formatInr(row.amountPaise)}
        </span>
      ) : (
        "—"
      ),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    width: "120px",
    render: (row) => (
      <span className="inline-flex items-center gap-2">
        <StatusDot status={statusDotToken(row.status)} size="sm" />
        <span className={row.status === "overdue" ? "text-risk" : undefined}>
          {row.statusLabel}
        </span>
        {row.status === "overdue" ? <Badge tone="risk">Overdue</Badge> : null}
      </span>
    ),
  },
  {
    key: "dueDate",
    label: "Due Date",
    sortable: true,
    width: "120px",
    render: (row) => (
      <span className={row.status === "overdue" ? "text-risk" : undefined}>
        {row.dueDate ?? "—"}
      </span>
    ),
  },
];

export function BillsPage({
  onNavigate,
}: {
  onNavigate: (view: string) => void;
}) {
  const [rows, setRows] = useState<BillRow[]>([]);
  const [filter, setFilter] = useState<BillFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ nodes: invoices }, snapshot] = await Promise.all([
        api<{ nodes: ApiNodeFull[] }>("/v1/nodes?type=Invoice"),
        loadGraphSnapshot(),
      ]);
      setRows(buildPurchaseBillRows(invoices, snapshot.nodes, snapshot.edges));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bills");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  const subtitle = useMemo(() => {
    if (loading) return "Loading…";
    return `${visible.length} ${visible.length === 1 ? "bill" : "bills"}`;
  }, [loading, visible.length]);

  if (error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PageHeader title="Bills" />
        <EmptyState
          title="Couldn’t load bills"
          description={error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Bills" subtitle={subtitle} />
      <div className="flex flex-wrap gap-2 border-b border-line px-5 py-3">
        {FILTERS.map((f) => (
          <FilterChip
            key={f.id}
            active={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </FilterChip>
        ))}
      </div>
      {loading ? (
        <p className="px-5 py-8 text-sm text-muted">Loading…</p>
      ) : (
        <DataTable
          columns={columns}
          data={visible}
          keyExtractor={(row) => row.key}
          selectedKey={selectedKey}
          onRowClick={(row) => {
            setSelectedKey(row.key);
            onNavigate(row.key);
          }}
          emptyTitle="No bills recorded"
          emptyDescription="Vendor invoices linked to purchase orders will show up here."
        />
      )}
    </div>
  );
}
