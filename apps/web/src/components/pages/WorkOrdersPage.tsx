"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Badge,
  Button,
  DataTable,
  FilterChip,
  PageHeader,
  StatusDot,
  type BadgeTone,
  type Column,
} from "@/components/ui";
import { formatInrExact } from "@/lib/format";
import {
  createWorkOrder,
  fetchBoms,
  fetchWorkOrders,
  type BomDto,
  type WorkOrderDto,
} from "@/lib/api";

const INPUT_CLASS =
  "w-full rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-signal";

type WoPriorityForm = "low" | "medium" | "high" | "urgent";

type WoStatus =
  | "draft"
  | "not_started"
  | "in_progress"
  | "completed"
  | "stopped"
  | "cancelled";

type MaterialStatus = "available" | "partial" | "not_available";
type Priority = "low" | "normal" | "high" | "urgent";
type JobCardStatus = "open" | "wip" | "completed" | "on_hold" | "cancelled";
type DetailTab = "materials" | "job-cards" | "costing";
type WoFilter = "all" | WoStatus;

type MaterialLine = {
  item: string;
  required: number;
  transferred: number;
  consumed: number;
  available: number;
  unit: string;
  status: MaterialStatus;
  note?: string;
};

type JobCard = {
  jcNo: string;
  operation: string;
  assignedTo: string | null;
  status: JobCardStatus;
  done: number;
  total: number;
  timeLabel: string;
};

type CostingLine = {
  label: string;
  plannedPaise: number;
  actualPaise: number | null;
};

type WorkOrder = {
  id: string;
  woNo: string;
  item: string;
  bomNo: string | null;
  quantity: number;
  producedQty: number;
  processLoss: number;
  status: WoStatus;
  priority: Priority;
  materialStatus: MaterialStatus;
  materialNote: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  salesOrder: string | null;
  materials: MaterialLine[];
  jobCards: JobCard[];
  costing: CostingLine[];
};

const FILTERS: { id: WoFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "not_started", label: "Not Started" },
  { id: "in_progress", label: "In Progress" },
  { id: "completed", label: "Completed" },
  { id: "stopped", label: "Stopped" },
];

function lineMaterialStatus(line: {
  requiredQty: number;
  transferredQty: number;
  availableQty: number;
}): MaterialStatus {
  if (line.transferredQty >= line.requiredQty) return "available";
  if (line.availableQty >= line.requiredQty) return "available";
  if (line.transferredQty > 0 || line.availableQty > 0) return "partial";
  return "not_available";
}

function formatTimeMinutes(minutes: number): string {
  if (minutes <= 0) return "—";
  const hours = minutes / 60;
  if (hours >= 10) return `${hours.toFixed(0)} h`;
  return `${hours.toFixed(1)} h`;
}

function salesOrderLabel(key: string | null): string | null {
  if (!key) return null;
  return key.startsWith("SalesOrder:") ? key.slice("SalesOrder:".length) : key;
}

function mapWorkOrder(dto: WorkOrderDto): WorkOrder {
  const actualTotal =
    dto.actualMaterialCostPaise != null && dto.actualOperationCostPaise != null
      ? dto.actualMaterialCostPaise + dto.actualOperationCostPaise
      : dto.actualMaterialCostPaise != null ||
          dto.actualOperationCostPaise != null
        ? (dto.actualMaterialCostPaise ?? 0) +
          (dto.actualOperationCostPaise ?? 0)
        : null;

  return {
    id: dto._id,
    woNo: dto.woNo,
    item: dto.itemName,
    bomNo: dto.bomNo,
    quantity: dto.quantity,
    producedQty: dto.producedQty,
    processLoss: dto.processLossQty,
    status: dto.status as WoStatus,
    priority: dto.priority as Priority,
    materialStatus: dto.materialStatus as MaterialStatus,
    materialNote: dto.materialNote,
    plannedStart: dto.plannedStartDate,
    plannedEnd: dto.plannedEndDate,
    salesOrder: salesOrderLabel(dto.salesOrderKey),
    materials: dto.materials.map((m) => ({
      item: m.itemName,
      required: m.requiredQty,
      transferred: m.transferredQty,
      consumed: m.consumedQty,
      available: m.availableQty,
      unit: m.uom,
      status: lineMaterialStatus(m),
    })),
    jobCards: dto.jobCards.map((jc) => ({
      jcNo: jc.jcNo,
      operation: jc.operationName,
      assignedTo: jc.assignedTo,
      status: jc.status as JobCardStatus,
      done: jc.completedQty,
      total: jc.forQuantity,
      timeLabel: formatTimeMinutes(jc.timeMinutes),
    })),
    costing: [
      {
        label: "Material cost",
        plannedPaise: dto.plannedMaterialCostPaise,
        actualPaise: dto.actualMaterialCostPaise,
      },
      {
        label: "Operation cost",
        plannedPaise: dto.plannedOperationCostPaise,
        actualPaise: dto.actualOperationCostPaise,
      },
      {
        label: "Total",
        plannedPaise: dto.totalCostPaise,
        actualPaise: actualTotal,
      },
    ],
  };
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isOverdue(wo: WorkOrder, today = new Date()): boolean {
  if (!wo.plannedEnd) return false;
  if (
    wo.status === "completed" ||
    wo.status === "draft" ||
    wo.status === "cancelled"
  ) {
    return false;
  }
  const end = new Date(`${wo.plannedEnd}T23:59:59`);
  return end.getTime() < today.getTime();
}

function statusLabel(status: WoStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "not_started":
      return "Not Started";
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Completed";
    case "stopped":
      return "Stopped";
    case "cancelled":
      return "Cancelled";
  }
}

function statusTone(status: WoStatus): BadgeTone {
  switch (status) {
    case "draft":
      return "muted";
    case "not_started":
      return "accent";
    case "in_progress":
      return "warn";
    case "completed":
      return "success";
    case "stopped":
    case "cancelled":
      return "risk";
  }
}

function materialTone(status: MaterialStatus): BadgeTone {
  switch (status) {
    case "available":
      return "success";
    case "partial":
      return "warn";
    case "not_available":
      return "risk";
  }
}

function materialLabel(status: MaterialStatus): string {
  switch (status) {
    case "available":
      return "Available";
    case "partial":
      return "Partial";
    case "not_available":
      return "Not Available";
  }
}

function jobStatusTone(status: JobCardStatus): BadgeTone {
  switch (status) {
    case "open":
      return "muted";
    case "wip":
      return "warn";
    case "completed":
      return "success";
    case "on_hold":
    case "cancelled":
      return "risk";
  }
}

function jobStatusLabel(status: JobCardStatus): string {
  switch (status) {
    case "open":
      return "Open";
    case "wip":
      return "WIP";
    case "completed":
      return "Completed";
    case "on_hold":
      return "On Hold";
    case "cancelled":
      return "Cancelled";
  }
}

function qtyLabel(wo: WorkOrder): string {
  if (wo.status === "in_progress") {
    return `${wo.producedQty}/${wo.quantity}`;
  }
  return String(wo.quantity);
}

function progressPct(wo: WorkOrder): number {
  if (wo.quantity <= 0) return 0;
  return Math.min(100, Math.round((wo.producedQty / wo.quantity) * 100));
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "risk" | "warn" | "teal" | "muted";
}) {
  const valueClass =
    tone === "risk"
      ? "text-risk"
      : tone === "warn"
        ? "text-warn"
        : tone === "teal"
          ? "text-teal"
          : "text-text";
  return (
    <div className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p
        className={[
          "mt-2 font-mono text-xl font-medium tabular-nums",
          valueClass,
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

function ProgressBar({
  pct,
  tone = "signal",
}: {
  pct: number;
  tone?: "signal" | "teal";
}) {
  const fill = tone === "teal" ? "bg-teal" : "bg-signal";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div
        className={["h-full rounded-full transition-[width]", fill].join(" ")}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

const columns: Column<WorkOrder>[] = [
  {
    key: "woNo",
    label: "WO No",
    sortable: true,
    width: "130px",
    render: (row) => (
      <span className="font-mono text-xs text-text">{row.woNo}</span>
    ),
  },
  {
    key: "item",
    label: "Item",
    sortable: true,
    render: (row) => <span className="text-sm text-text">{row.item}</span>,
  },
  {
    key: "quantity",
    label: "Qty",
    sortable: true,
    align: "right",
    numeric: true,
    width: "90px",
    render: (row) => (
      <span className="font-mono text-sm tabular-nums">{qtyLabel(row)}</span>
    ),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    width: "130px",
    render: (row) => (
      <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
    ),
  },
  {
    key: "materialStatus",
    label: "Material",
    sortable: true,
    width: "120px",
    render: (row) => (
      <Badge tone={materialTone(row.materialStatus)}>
        {materialLabel(row.materialStatus)}
      </Badge>
    ),
  },
  {
    key: "priority",
    label: "Priority",
    sortable: true,
    width: "100px",
    render: (row) =>
      row.priority === "urgent" ? (
        <Badge tone="risk">Urgent</Badge>
      ) : row.priority === "high" ? (
        <Badge tone="warn">High</Badge>
      ) : (
        <span className="text-sm text-muted">
          {row.priority === "low" ? "Low" : "Normal"}
        </span>
      ),
  },
  {
    key: "plannedStart",
    label: "Planned Start",
    sortable: true,
    width: "120px",
    render: (row) => (
      <span className="text-sm text-muted">{formatDate(row.plannedStart)}</span>
    ),
  },
  {
    key: "plannedEnd",
    label: "Planned End",
    sortable: true,
    width: "120px",
    render: (row) => (
      <span
        className={[
          "text-sm",
          isOverdue(row) ? "text-risk" : "text-muted",
        ].join(" ")}
      >
        {formatDate(row.plannedEnd)}
      </span>
    ),
  },
  {
    key: "bomNo",
    label: "BOM No",
    sortable: true,
    width: "130px",
    render: (row) => (
      <span className="font-mono text-xs text-muted">{row.bomNo ?? "—"}</span>
    ),
  },
  {
    key: "salesOrder",
    label: "Sales Order",
    sortable: true,
    width: "110px",
    render: (row) => (
      <span className="font-mono text-xs text-muted">
        {row.salesOrder ?? "—"}
      </span>
    ),
  },
];

export function WorkOrdersPage({
  onNavigate: _onNavigate,
}: {
  onNavigate: (view: string) => void;
}) {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<WoFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("materials");
  const [createOpen, setCreateOpen] = useState(false);
  const [bomOptions, setBomOptions] = useState<BomDto[]>([]);
  const [formBomId, setFormBomId] = useState("");
  const [formQty, setFormQty] = useState("1");
  const [formPriority, setFormPriority] = useState<WoPriorityForm>("medium");
  const [formDueDate, setFormDueDate] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadOrders = () => {
    setLoading(true);
    setError(null);
    return fetchWorkOrders()
      .then((rows) => {
        const mapped = rows.map(mapWorkOrder);
        setOrders(mapped);
        setSelectedId((prev) => {
          if (prev && mapped.some((w) => w.id === prev)) return prev;
          return mapped[0]?.id ?? null;
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load");
        setOrders([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchWorkOrders()
      .then((rows) => {
        if (cancelled) return;
        const mapped = rows.map(mapWorkOrder);
        setOrders(mapped);
        setSelectedId((prev) => {
          if (prev && mapped.some((w) => w.id === prev)) return prev;
          return mapped[0]?.id ?? null;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
        setOrders([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!createOpen) return;
    let cancelled = false;
    fetchBoms()
      .then((rows) => {
        if (cancelled) return;
        setBomOptions(rows);
        setFormBomId((prev) => prev || rows[0]?._id || "");
      })
      .catch(() => {
        if (!cancelled) setFormError("Could not load BOMs");
      });
    return () => {
      cancelled = true;
    };
  }, [createOpen]);

  const resetCreateForm = () => {
    setFormBomId("");
    setFormQty("1");
    setFormPriority("medium");
    setFormDueDate("");
    setFormNotes("");
    setFormError(null);
  };

  const onSubmitCreate = async (e: FormEvent) => {
    e.preventDefault();
    const qty = Number(formQty);
    if (!formBomId || !Number.isFinite(qty) || qty <= 0 || !formDueDate) {
      setFormError("BOM, quantity, and due date are required");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const wo = await createWorkOrder({
        bomId: formBomId,
        qty,
        priority: formPriority,
        dueDate: formDueDate,
        ...(formNotes.trim() ? { notes: formNotes.trim() } : {}),
      });
      setCreateOpen(false);
      resetCreateForm();
      await loadOrders();
      setSelectedId(wo._id);
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Failed to create work order",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const summary = useMemo(() => {
    return {
      draft: orders.filter((w) => w.status === "draft").length,
      notStarted: orders.filter((w) => w.status === "not_started").length,
      inProgress: orders.filter((w) => w.status === "in_progress").length,
      completed: orders.filter((w) => w.status === "completed").length,
      overdue: orders.filter((w) => isOverdue(w)).length,
      materialShortage: orders.filter(
        (w) =>
          w.materialStatus === "partial" || w.materialStatus === "not_available",
      ).length,
    };
  }, [orders]);

  const filtered = useMemo(() => {
    if (filter === "all") return orders;
    return orders.filter((w) => w.status === filter);
  }, [filter, orders]);

  const selected =
    orders.find((w) => w.id === selectedId) ?? filtered[0] ?? null;

  const pct = selected ? progressPct(selected) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <PageHeader
        title="Work Orders"
        subtitle={
          loading
            ? "Loading…"
            : `${orders.length} order${orders.length === 1 ? "" : "s"}`
        }
        trailing={
          <Button
            size="sm"
            onClick={() => {
              resetCreateForm();
              const inAWeek = new Date();
              inAWeek.setDate(inAWeek.getDate() + 7);
              setFormDueDate(inAWeek.toISOString().slice(0, 10));
              setCreateOpen(true);
            }}
          >
            + New Work Order
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 px-5 py-5 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Draft" value={summary.draft} tone="muted" />
        <SummaryCard label="Not Started" value={summary.notStarted} />
        <SummaryCard
          label="In Progress"
          value={summary.inProgress}
          tone="warn"
        />
        <SummaryCard
          label="Completed"
          value={summary.completed}
          tone="teal"
        />
        <SummaryCard label="Overdue" value={summary.overdue} tone="risk" />
        <SummaryCard
          label="Material Shortage"
          value={summary.materialShortage}
          tone={summary.materialShortage > 0 ? "warn" : "teal"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 pb-3">
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

      {error ? (
        <div className="px-5 py-8 text-sm text-risk">{error}</div>
      ) : loading ? (
        <div className="px-5 py-8 text-sm text-muted">Loading work orders…</div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={(row) => row.id}
          selectedKey={selected?.id ?? null}
          onRowClick={(row) => {
            setSelectedId(row.id);
            setDetailTab("materials");
          }}
          emptyTitle="No work orders"
          emptyDescription="No work orders match this filter."
        />
      )}

      {selected && !loading ? (
        <section className="border-t border-line px-5 py-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-mono text-sm font-medium text-text">
                  {selected.woNo}
                </h2>
                <Badge tone={statusTone(selected.status)}>
                  {statusLabel(selected.status)}
                </Badge>
                {selected.priority === "urgent" ? (
                  <Badge tone="risk">Urgent</Badge>
                ) : null}
                <span className="inline-flex items-center gap-1.5 text-sm text-muted">
                  <StatusDot status={selected.status} size="sm" />
                  {selected.item}
                </span>
              </div>
              <p className="text-sm text-muted">
                {selected.producedQty}/{selected.quantity} produced
                {selected.processLoss > 0
                  ? ` · +${selected.processLoss} process loss`
                  : ""}
                {selected.materialNote ? ` · ${selected.materialNote}` : ""}
              </p>
              <div className="max-w-md space-y-1">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Progress</span>
                  <span className="font-mono tabular-nums">{pct}%</span>
                </div>
                <ProgressBar
                  pct={pct}
                  tone={selected.status === "completed" ? "teal" : "signal"}
                />
              </div>
            </div>
            <div className="text-right text-sm text-muted">
              <p>
                BOM{" "}
                <span className="font-mono text-text">
                  {selected.bomNo ?? "—"}
                </span>
              </p>
              <p className="mt-0.5">
                SO{" "}
                <span className="font-mono text-text">
                  {selected.salesOrder ?? "—"}
                </span>
              </p>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {(
              [
                { id: "materials", label: "Materials" },
                { id: "job-cards", label: "Job Cards" },
                { id: "costing", label: "Costing" },
              ] as const
            ).map((tab) => (
              <FilterChip
                key={tab.id}
                active={detailTab === tab.id}
                onClick={() => setDetailTab(tab.id)}
              >
                {tab.label}
              </FilterChip>
            ))}
          </div>

          {detailTab === "materials" ? (
            <div className="overflow-x-auto rounded-[var(--radius-md)] border border-line">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-2/40 text-xs uppercase tracking-wider text-muted">
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 text-right font-medium">Required</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Transferred
                    </th>
                    <th className="px-3 py-2 text-right font-medium">Consumed</th>
                    <th className="px-3 py-2 text-right font-medium">Available</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.materials.map((line) => {
                    const short =
                      line.status === "partial" ||
                      line.status === "not_available";
                    return (
                      <tr
                        key={line.item}
                        className={[
                          "border-b border-line last:border-b-0",
                          short ? "bg-risk/5" : "",
                        ].join(" ")}
                      >
                        <td className="px-3 py-2.5">
                          <span
                            className={short ? "text-risk" : "text-text"}
                          >
                            {line.item}
                          </span>
                          {line.note ? (
                            <span className="mt-0.5 block text-xs text-muted">
                              {line.note}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                          {line.required} {line.unit}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted">
                          {line.transferred} {line.unit}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted">
                          {line.consumed} {line.unit}
                        </td>
                        <td
                          className={[
                            "px-3 py-2.5 text-right font-mono tabular-nums",
                            short ? "text-risk" : "text-teal",
                          ].join(" ")}
                        >
                          {line.available} {line.unit}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge tone={materialTone(line.status)}>
                            {materialLabel(line.status)}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {detailTab === "job-cards" ? (
            selected.jobCards.length === 0 ? (
              <p className="text-sm text-muted">
                No job cards yet — release the work order to generate operations.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-[var(--radius-md)] border border-line">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface-2/40 text-xs uppercase tracking-wider text-muted">
                      <th className="px-3 py-2 font-medium">JC No</th>
                      <th className="px-3 py-2 font-medium">Operation</th>
                      <th className="px-3 py-2 font-medium">Assigned To</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 text-right font-medium">
                        Progress
                      </th>
                      <th className="px-3 py-2 text-right font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.jobCards.map((jc) => (
                      <tr
                        key={jc.jcNo}
                        className="border-b border-line last:border-b-0"
                      >
                        <td className="px-3 py-2.5 font-mono text-xs">
                          {jc.jcNo}
                        </td>
                        <td className="px-3 py-2.5 text-text">{jc.operation}</td>
                        <td className="px-3 py-2.5 text-muted">
                          {jc.assignedTo ?? "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge tone={jobStatusTone(jc.status)}>
                            {jobStatusLabel(jc.status)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                          {jc.done}/{jc.total}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-muted tabular-nums">
                          {jc.timeLabel}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}

          {detailTab === "costing" ? (
            <div className="overflow-x-auto rounded-[var(--radius-md)] border border-line">
              <table className="w-full min-w-[420px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-2/40 text-xs uppercase tracking-wider text-muted">
                    <th className="px-3 py-2 font-medium">Cost head</th>
                    <th className="px-3 py-2 text-right font-medium">Planned</th>
                    <th className="px-3 py-2 text-right font-medium">Actual</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.costing.map((line) => {
                    const isTotal = line.label === "Total";
                    return (
                      <tr
                        key={line.label}
                        className={[
                          "border-b border-line last:border-b-0",
                          isTotal ? "bg-surface-2/30" : "",
                        ].join(" ")}
                      >
                        <td
                          className={[
                            "px-3 py-2.5",
                            isTotal ? "font-medium text-text" : "text-muted",
                          ].join(" ")}
                        >
                          {line.label}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                          {formatInrExact(line.plannedPaise)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                          {line.actualPaise != null
                            ? formatInrExact(line.actualPaise)
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {selected.status === "completed" && selected.quantity > 0 ? (
                <p className="border-t border-line px-3 py-2 text-xs text-muted">
                  Actual unit cost{" "}
                  <span className="font-mono text-text">
                    {formatInrExact(
                      Math.round(
                        (selected.costing.find((c) => c.label === "Total")
                          ?.actualPaise ?? 0) / selected.quantity,
                      ),
                    )}
                  </span>
                  /unit
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-wo-title"
            className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-[var(--radius-md)] border border-line bg-surface p-5 shadow-lg"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="create-wo-title"
                  className="text-base font-medium text-text"
                >
                  Create Work Order
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Plan production against an existing BOM.
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
                  BOM
                </span>
                <select
                  className={INPUT_CLASS}
                  value={formBomId}
                  onChange={(e) => setFormBomId(e.target.value)}
                  required
                >
                  <option value="">Select BOM…</option>
                  {bomOptions.map((bom) => (
                    <option key={bom._id} value={bom._id}>
                      {bom.bomNo} — {bom.itemName}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
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
                    Priority
                  </span>
                  <select
                    className={INPUT_CLASS}
                    value={formPriority}
                    onChange={(e) =>
                      setFormPriority(e.target.value as WoPriorityForm)
                    }
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-muted">
                  Due date
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
                <Button type="submit" size="sm" disabled={submitting}>
                  {submitting ? "Creating…" : "Create Work Order"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
