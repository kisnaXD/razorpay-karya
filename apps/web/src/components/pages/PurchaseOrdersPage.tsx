"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  api,
  createEdge,
  createNode,
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

const INPUT_CLASS =
  "w-full rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-signal";

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

function propString(
  props: ApiNodeFull["props"],
  key: string,
): string | null {
  const value = props[key];
  return typeof value === "string" ? value : null;
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
  const [createOpen, setCreateOpen] = useState(false);
  const [vendors, setVendors] = useState<ApiNodeFull[]>([]);
  const [materials, setMaterials] = useState<ApiNodeFull[]>([]);
  const [formPoNumber, setFormPoNumber] = useState("");
  const [formVendorKey, setFormVendorKey] = useState("");
  const [formMaterialKey, setFormMaterialKey] = useState("");
  const [formQty, setFormQty] = useState("1");
  const [formExpectedAt, setFormExpectedAt] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!createOpen) return;
    let cancelled = false;
    Promise.all([
      api<{ nodes: ApiNodeFull[] }>("/v1/nodes?type=Org"),
      api<{ nodes: ApiNodeFull[] }>("/v1/nodes?type=Material"),
    ])
      .then(([orgsRes, materialsRes]) => {
        if (cancelled) return;
        const vend = orgsRes.nodes.filter(
          (n) => propString(n.props, "role") === "vendor",
        );
        setVendors(vend);
        setMaterials(materialsRes.nodes);
        setFormVendorKey((prev) => prev || vend[0]?.key || "");
        setFormMaterialKey((prev) => prev || materialsRes.nodes[0]?.key || "");
      })
      .catch(() => {
        if (!cancelled) setFormError("Could not load form options");
      });
    return () => {
      cancelled = true;
    };
  }, [createOpen]);

  const resetCreateForm = () => {
    setFormPoNumber("");
    setFormVendorKey("");
    setFormMaterialKey("");
    setFormQty("1");
    setFormExpectedAt("");
    setFormNotes("");
    setFormError(null);
  };

  const onSubmitCreate = async (e: FormEvent) => {
    e.preventDefault();
    const poNumber = formPoNumber.trim();
    const qty = Number(formQty);
    if (!poNumber || !formVendorKey || !formMaterialKey) {
      setFormError("PO number, vendor, and material are required");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setFormError("Quantity must be greater than zero");
      return;
    }
    if (!formExpectedAt) {
      setFormError("Expected delivery date is required");
      return;
    }

    const key = poNumber.includes(":")
      ? poNumber
      : `PurchaseOrder:${poNumber}`;
    const label = shortKey(key);
    const expectedAt = new Date(formExpectedAt).toISOString();

    setSubmitting(true);
    setFormError(null);
    try {
      await createNode({
        type: "PurchaseOrder",
        key,
        label,
        props: {
          status: "open",
          expectedAt,
          qty,
          vendor_key: formVendorKey,
          material_key: formMaterialKey,
          ...(formNotes.trim() ? { note: formNotes.trim() } : {}),
        },
      });
      await createEdge({
        type: "ORDER_CONTAINS",
        fromKey: key,
        toKey: formMaterialKey,
        props: { qty, uom: "kg" },
      });
      await createEdge({
        type: "CONTACT_AT",
        fromKey: formVendorKey,
        toKey: key,
      });
      try {
        await createEdge({
          type: "SUPPLIES",
          fromKey: formVendorKey,
          toKey: formMaterialKey,
        });
      } catch {
        // SUPPLIES may already exist
      }
      setCreateOpen(false);
      resetCreateForm();
      await load();
      setSelectedKey(key);
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Failed to create purchase order",
      );
    } finally {
      setSubmitting(false);
    }
  };

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
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              resetCreateForm();
              setCreateOpen(true);
            }}
          >
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

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-po-title"
            className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl border border-line bg-surface p-5 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="create-po-title"
                  className="text-base font-medium text-text"
                >
                  New Purchase Order
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Order material from a vendor.
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
                  PO Number
                </span>
                <input
                  className={INPUT_CLASS}
                  value={formPoNumber}
                  onChange={(e) => setFormPoNumber(e.target.value)}
                  placeholder="PO-109"
                  required
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted">
                  Vendor
                </span>
                <select
                  className={INPUT_CLASS}
                  value={formVendorKey}
                  onChange={(e) => setFormVendorKey(e.target.value)}
                  required
                >
                  <option value="">Select vendor…</option>
                  {vendors.map((v) => (
                    <option key={v.key} value={v.key}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted">
                  Material
                </span>
                <select
                  className={INPUT_CLASS}
                  value={formMaterialKey}
                  onChange={(e) => setFormMaterialKey(e.target.value)}
                  required
                >
                  <option value="">Select material…</option>
                  {materials.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
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
                  min="0"
                  step="any"
                  value={formQty}
                  onChange={(e) => setFormQty(e.target.value)}
                  required
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted">
                  Expected Delivery Date
                </span>
                <input
                  className={INPUT_CLASS}
                  type="date"
                  value={formExpectedAt}
                  onChange={(e) => setFormExpectedAt(e.target.value)}
                  required
                />
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
                  {submitting ? "Creating…" : "Create PO"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
