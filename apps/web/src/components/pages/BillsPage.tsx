"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  api,
  createEdge,
  createNode,
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

const INPUT_CLASS =
  "w-full rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-signal";

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

function propString(
  props: ApiNodeFull["props"],
  key: string,
): string | null {
  const value = props[key];
  return typeof value === "string" ? value : null;
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

    // Also accept bills tagged via props.purchaseOrderKey without waiting for edge load
    if (!po && typeof inv.props.purchaseOrderKey === "string") {
      po = nodes.find((n) => n.key === inv.props.purchaseOrderKey) ?? null;
      if (po && po.type !== "PurchaseOrder") po = null;
    }

    const isVendorBill = inv.props.bill === true;
    if (!po && !isVendorBill) continue;

    let vendor = "—";
    if (po) {
      const contact = edges.find(
        (e) => e.type === "CONTACT_AT" && e.toId === po!._id,
      );
      if (contact) {
        vendor = nodeById.get(contact.fromId)?.label ?? "—";
      } else if (typeof po.props.vendor_key === "string") {
        const v = nodes.find((n) => n.key === po!.props.vendor_key);
        vendor = v?.label ?? shortKey(po.props.vendor_key);
      }
    }
    if (vendor === "—" && typeof inv.props.vendorOrgKey === "string") {
      const v = nodes.find((n) => n.key === inv.props.vendorOrgKey);
      vendor = v?.label ?? shortKey(String(inv.props.vendorOrgKey));
    }

    const status = normalizeBillStatus(String(inv.props.status ?? "unpaid"));
    const dueRaw =
      typeof inv.props.dueAt === "string" ? inv.props.dueAt : null;

    rows.push({
      key: inv.key,
      billNumber: shortKey(inv.key),
      vendor,
      poReference: po ? shortKey(po.key) : "—",
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
  const [createOpen, setCreateOpen] = useState(false);
  const [vendors, setVendors] = useState<ApiNodeFull[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<ApiNodeFull[]>([]);
  const [formBillNumber, setFormBillNumber] = useState("");
  const [formVendorKey, setFormVendorKey] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDueDate, setFormDueDate] = useState("");
  const [formPoKey, setFormPoKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!createOpen) return;
    let cancelled = false;
    Promise.all([
      api<{ nodes: ApiNodeFull[] }>("/v1/nodes?type=Org"),
      api<{ nodes: ApiNodeFull[] }>("/v1/nodes?type=PurchaseOrder"),
    ])
      .then(([orgsRes, posRes]) => {
        if (cancelled) return;
        const vend = orgsRes.nodes.filter(
          (n) => propString(n.props, "role") === "vendor",
        );
        setVendors(vend);
        setPurchaseOrders(posRes.nodes);
        setFormVendorKey((prev) => prev || vend[0]?.key || "");
      })
      .catch(() => {
        if (!cancelled) setFormError("Could not load form options");
      });
    return () => {
      cancelled = true;
    };
  }, [createOpen]);

  const resetCreateForm = () => {
    setFormBillNumber("");
    setFormVendorKey("");
    setFormAmount("");
    setFormDueDate("");
    setFormPoKey("");
    setFormError(null);
  };

  const onSubmitCreate = async (e: FormEvent) => {
    e.preventDefault();
    const billNumber = formBillNumber.trim();
    const amountRupees = Number(formAmount);
    if (!billNumber || !formVendorKey) {
      setFormError("Bill number and vendor are required");
      return;
    }
    if (!Number.isFinite(amountRupees) || amountRupees <= 0) {
      setFormError("Amount must be greater than zero");
      return;
    }
    if (!formDueDate) {
      setFormError("Due date is required");
      return;
    }

    const key = billNumber.includes(":")
      ? billNumber
      : `Invoice:${billNumber}`;
    const label = shortKey(key);
    const amountInPaise = Math.round(amountRupees * 100);
    const dueAt = new Date(formDueDate).toISOString();

    setSubmitting(true);
    setFormError(null);
    try {
      await createNode({
        type: "Invoice",
        key,
        label,
        props: {
          status: "unpaid",
          amountInPaise,
          dueAt,
          issuedAt: new Date().toISOString(),
          vendorOrgKey: formVendorKey,
          bill: true,
          ...(formPoKey ? { purchaseOrderKey: formPoKey } : {}),
        },
      });
      await createEdge({
        type: "ABOUT",
        fromKey: key,
        toKey: formVendorKey,
      });
      if (formPoKey) {
        await createEdge({
          type: "INVOICES",
          fromKey: key,
          toKey: formPoKey,
        });
      }
      setCreateOpen(false);
      resetCreateForm();
      await load();
      setSelectedKey(key);
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Failed to create bill",
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
      <PageHeader
        title="Bills"
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
            + New Bill
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
          emptyTitle="No bills recorded"
          emptyDescription="Vendor invoices linked to purchase orders will show up here."
        />
      )}

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-bill-title"
            className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl border border-line bg-surface p-5 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="create-bill-title"
                  className="text-base font-medium text-text"
                >
                  New Bill
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Record a vendor bill, optionally linked to a PO.
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
                  Bill Number
                </span>
                <input
                  className={INPUT_CLASS}
                  value={formBillNumber}
                  onChange={(e) => setFormBillNumber(e.target.value)}
                  placeholder="BILL-101"
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
                  Amount (₹)
                </span>
                <input
                  className={INPUT_CLASS}
                  type="number"
                  min="0"
                  step="0.01"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="15000"
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
                  PO Reference (optional)
                </span>
                <select
                  className={INPUT_CLASS}
                  value={formPoKey}
                  onChange={(e) => setFormPoKey(e.target.value)}
                >
                  <option value="">None</option>
                  {purchaseOrders.map((po) => (
                    <option key={po.key} value={po.key}>
                      {po.label || shortKey(po.key)}
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
                  {submitting ? "Creating…" : "Create Bill"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
