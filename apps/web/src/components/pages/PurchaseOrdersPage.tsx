"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchPendingApprovals,
  type ApiNodeFull,
  type ApprovalDto,
} from "@/lib/api";
import { formatInr } from "@/lib/format";
import { loadGraphSnapshot, type GraphSnapshot } from "@/lib/graph-data";
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

type PoFilter = "all" | "draft" | "pending" | "approved" | "received";

type PoStatus = Exclude<PoFilter, "all">;

type PoRow = {
  key: string;
  poNumber: string;
  vendor: string;
  material: string;
  qty: number | null;
  amountPaise: number | null;
  status: PoStatus;
  statusLabel: string;
  dateLabel: string | null;
  pendingApproval: boolean;
  dateSort: number;
};

const FILTERS: { id: PoFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "pending", label: "Pending Approval" },
  { id: "approved", label: "Approved" },
  { id: "received", label: "Received" },
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

function normalizeStatus(raw: string): PoStatus {
  const s = raw.toLowerCase();
  if (s === "draft") return "draft";
  if (s === "pending" || s === "awaiting_approval") return "pending";
  if (s === "received" || s === "delivered") return "received";
  return "approved";
}

function statusDotToken(status: PoStatus): string {
  switch (status) {
    case "draft":
      return "draft";
    case "pending":
      return "pending";
    case "approved":
      return "confirmed";
    case "received":
      return "received";
  }
}

function statusLabel(status: PoStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "pending":
      return "Pending Approval";
    case "approved":
      return "Approved";
    case "received":
      return "Received";
  }
}

function enrichPoRow(node: ApiNodeFull, snapshot: GraphSnapshot): PoRow {
  let qty = typeof node.props.qty === "number" ? node.props.qty : null;
  const amountPaise =
    typeof node.props.amountInPaise === "number"
      ? node.props.amountInPaise
      : null;
  let vendor =
    typeof node.props.vendor_key === "string"
      ? snapshot.nodeByKey.get(node.props.vendor_key)?.label ??
        shortKey(node.props.vendor_key)
      : "—";
  let material =
    typeof node.props.material_key === "string"
      ? snapshot.nodeByKey.get(node.props.material_key)?.label ??
        shortKey(node.props.material_key)
      : "—";

  const containsEdge = snapshot.edges.find(
    (e) => e.type === "ORDER_CONTAINS" && e.fromId === node._id,
  );
  if (containsEdge) {
    const materialNode = snapshot.nodeById.get(containsEdge.toId);
    if (materialNode) material = materialNode.label;
    if (qty === null && typeof containsEdge.props.qty === "number") {
      qty = containsEdge.props.qty;
    }
  }

  const contactEdge = snapshot.edges.find(
    (e) => e.type === "CONTACT_AT" && e.toId === node._id,
  );
  if (contactEdge) {
    vendor = snapshot.nodeById.get(contactEdge.fromId)?.label ?? vendor;
  } else if (containsEdge && vendor === "—") {
    const suppliesEdge = snapshot.edges.find(
      (e) => e.type === "SUPPLIES" && e.toId === containsEdge.toId,
    );
    if (suppliesEdge) {
      vendor = snapshot.nodeById.get(suppliesEdge.fromId)?.label ?? "—";
    }
  }

  const expectedRaw =
    typeof node.props.expectedAt === "string" ? node.props.expectedAt : null;
  const status = normalizeStatus(String(node.props.status ?? "open"));

  return {
    key: node.key,
    poNumber: shortKey(node.key),
    vendor,
    material,
    qty,
    amountPaise,
    status,
    statusLabel: statusLabel(status),
    dateLabel: formatDate(expectedRaw),
    pendingApproval: false,
    dateSort: expectedRaw ? new Date(expectedRaw).getTime() || 0 : 0,
  };
}

function rowsFromApprovals(approvals: ApprovalDto[]): PoRow[] {
  return approvals
    .filter((a) => a.proposedAction.action === "po.create")
    .map((a) => {
      const meta = a.proposedAction.metadata ?? {};
      const poKey =
        typeof meta.poKey === "string" ? meta.poKey : `approval:${a._id}`;
      const vendor =
        typeof meta.vendorLabel === "string"
          ? meta.vendorLabel
          : a.proposedAction.targetNodeKey
            ? shortKey(a.proposedAction.targetNodeKey)
            : "—";
      const material =
        typeof meta.materialLabel === "string"
          ? meta.materialLabel
          : typeof meta.materialKey === "string"
            ? shortKey(meta.materialKey)
            : "—";
      const qty = typeof meta.qtyKg === "number" ? meta.qtyKg : null;
      const expectedAt =
        typeof meta.expectedAt === "string" ? meta.expectedAt : a.createdAt;

      return {
        key: poKey,
        poNumber: shortKey(poKey),
        vendor,
        material,
        qty,
        amountPaise: a.proposedAction.amountInPaise ?? null,
        status: "pending" as const,
        statusLabel: statusLabel("pending"),
        dateLabel: formatDate(expectedAt),
        pendingApproval: true,
        dateSort: new Date(expectedAt).getTime() || 0,
      };
    });
}

const columns: Column<PoRow>[] = [
  {
    key: "poNumber",
    label: "PO #",
    sortable: true,
    width: "100px",
    render: (row) => (
      <span
        className={[
          "font-mono text-xs",
          row.pendingApproval ? "text-warn" : "",
        ].join(" ")}
      >
        {row.poNumber}
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
    key: "material",
    label: "Material",
    sortable: true,
    render: (row) => row.material,
  },
  {
    key: "qty",
    label: "Qty",
    sortable: true,
    width: "80px",
    align: "right",
    numeric: true,
    render: (row) =>
      row.qty !== null ? (
        <span className="font-mono tabular-nums">{row.qty}</span>
      ) : (
        "—"
      ),
  },
  {
    key: "amountPaise",
    label: "Amount (₹)",
    sortable: true,
    width: "110px",
    align: "right",
    numeric: true,
    render: (row) =>
      row.amountPaise !== null ? (
        <span className="font-mono tabular-nums">
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
    width: "160px",
    render: (row) => (
      <span className="inline-flex items-center gap-2">
        <StatusDot status={statusDotToken(row.status)} size="sm" />
        <span className={row.pendingApproval ? "text-warn" : undefined}>
          {row.statusLabel}
        </span>
        {row.pendingApproval ? <Badge tone="warn">Approval</Badge> : null}
      </span>
    ),
  },
  {
    key: "dateLabel",
    label: "Date",
    sortable: true,
    width: "120px",
    render: (row) => row.dateLabel ?? "—",
  },
];

export function PurchaseOrdersPage({
  onNavigate,
}: {
  onNavigate: (view: string) => void;
}) {
  const [rows, setRows] = useState<PoRow[]>([]);
  const [filter, setFilter] = useState<PoFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [snapshot, approvals] = await Promise.all([
        loadGraphSnapshot(),
        fetchPendingApprovals(),
      ]);
      const graphRows = snapshot.nodes
        .filter((n) => n.type === "PurchaseOrder")
        .map((n) => enrichPoRow(n, snapshot));
      const pendingRows = rowsFromApprovals(approvals);
      const pendingKeys = new Set(pendingRows.map((r) => r.key));
      const merged = [
        ...pendingRows,
        ...graphRows.filter((r) => !pendingKeys.has(r.key)),
      ].sort((a, b) => {
        if (a.pendingApproval !== b.pendingApproval) {
          return a.pendingApproval ? -1 : 1;
        }
        return b.dateSort - a.dateSort || a.poNumber.localeCompare(b.poNumber);
      });
      setRows(merged);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load purchase orders",
      );
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
    return `${visible.length} ${visible.length === 1 ? "order" : "orders"}`;
  }, [loading, visible.length]);

  if (error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PageHeader title="Purchase Orders" />
        <EmptyState
          title="Couldn’t load purchase orders"
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
      <PageHeader
        title="Purchase Orders"
        subtitle={subtitle}
        trailing={
          <Button size="sm" onClick={() => onNavigate("purchase-orders/new")}>
            + New PO
          </Button>
        }
      />
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
          emptyTitle="No purchase orders"
          emptyDescription="Draft or approve a PO to see it listed here."
        />
      )}
    </div>
  );
}
