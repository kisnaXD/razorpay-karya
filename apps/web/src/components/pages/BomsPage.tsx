"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  FilterChip,
  PageHeader,
  Tooltip,
  type Column,
} from "@/components/ui";
import { fetchBoms, type BomDto } from "@/lib/api";
import { formatInr } from "@/lib/format";

type BomStatus = "active" | "draft" | "inactive";
type DetailTab = "components" | "operations" | "costing";
type BomFilter = "all" | BomStatus;

const FILTERS: { id: BomFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "draft", label: "Draft" },
  { id: "inactive", label: "Inactive" },
];

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "components", label: "Components" },
  { id: "operations", label: "Operations" },
  { id: "costing", label: "Costing" },
];

function formatRupees(amount: number): string {
  const digits = Number.isInteger(amount) ? 0 : 2;
  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: 2,
  })}`;
}

function formatQty(qty: number, uom: string): string {
  const base = Number.isInteger(qty)
    ? String(qty)
    : qty.toFixed(3).replace(/\.?0+$/, "");
  return `${base} ${uom}`;
}

function statusTone(status: BomStatus): "success" | "muted" | "warn" {
  if (status === "active") return "success";
  if (status === "inactive") return "warn";
  return "muted";
}

function itemTypeLabel(itemKey: string): string {
  return itemKey.startsWith("SKU:") && itemKey.includes("Cast-Blank")
    ? "Sub-assembly"
    : itemKey.startsWith("SKU:")
      ? "Finished Good"
      : "Item";
}

function componentTypeLabel(itemType: string): string {
  switch (itemType) {
    case "raw_material":
      return "Raw Material";
    case "sub_assembly":
      return "Sub-assembly";
    case "consumable":
      return "Consumable";
    case "packing":
      return "Packaging";
    default:
      return itemType;
  }
}

function componentTypeTone(
  itemType: string,
): "accent" | "muted" | "success" | "warn" {
  switch (itemType) {
    case "sub_assembly":
      return "accent";
    case "raw_material":
      return "success";
    case "consumable":
      return "warn";
    case "packing":
      return "muted";
    default:
      return "muted";
  }
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-line rounded-[var(--radius-md)] p-4">
      <p className="text-sm uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-2 font-mono text-xl font-medium tabular-nums text-text">
        {value}
      </p>
    </div>
  );
}

const columns: Column<BomDto>[] = [
  {
    key: "bomNo",
    label: "BOM No",
    sortable: true,
    width: "140px",
    render: (row) => (
      <span className="font-mono text-xs tabular-nums">{row.bomNo}</span>
    ),
  },
  {
    key: "itemName",
    label: "Item",
    sortable: true,
    render: (row) => (
      <span className="inline-flex flex-col gap-0.5">
        <span className="text-text">{row.itemName}</span>
        <span className="text-xs text-muted">{itemTypeLabel(row.itemKey)}</span>
      </span>
    ),
  },
  {
    key: "quantity",
    label: "Output Qty",
    sortable: true,
    width: "100px",
    render: (row) => (
      <span className="tabular-nums text-muted">
        {formatQty(row.quantity, row.uom)}
      </span>
    ),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    width: "100px",
    render: (row) => (
      <Badge tone={statusTone(row.status)}>
        {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
      </Badge>
    ),
  },
  {
    key: "isDefault",
    label: "Default",
    sortable: true,
    width: "80px",
    render: (row) =>
      row.isDefault ? (
        <span className="text-teal" aria-label="Default BOM">
          ✓
        </span>
      ) : (
        <span className="text-muted">—</span>
      ),
  },
  {
    key: "lines",
    label: "Components",
    sortable: true,
    width: "110px",
    render: (row) => (
      <span className="text-muted">
        {row.lines.length} {row.lines.length === 1 ? "item" : "items"}
      </span>
    ),
  },
  {
    key: "operations",
    label: "Operations",
    sortable: true,
    width: "100px",
    render: (row) => (
      <span className="text-muted">
        {row.operations.length} {row.operations.length === 1 ? "op" : "ops"}
      </span>
    ),
  },
  {
    key: "totalCostPaise",
    label: "Total Cost",
    sortable: true,
    align: "right",
    numeric: true,
    width: "110px",
    render: (row) => (
      <span className="font-mono tabular-nums">
        {formatInr(row.totalCostPaise)}
      </span>
    ),
  },
];

export function BomsPage({
  onNavigate: _onNavigate,
}: {
  onNavigate: (view: string) => void;
}) {
  const [boms, setBoms] = useState<BomDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<BomFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("components");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchBoms()
      .then((data) => {
        if (!cancelled) setBoms(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load BOMs");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(
    () => (filter === "all" ? boms : boms.filter((b) => b.status === filter)),
    [boms, filter],
  );

  const selected = useMemo(
    () => boms.find((b) => b._id === selectedId) ?? null,
    [boms, selectedId],
  );

  const activeCount = boms.filter((b) => b.status === "active").length;
  const draftCount = boms.filter((b) => b.status === "draft").length;
  const avgMaterialCostPaise =
    boms.length === 0
      ? 0
      : Math.round(
          boms.reduce((sum, b) => sum + b.rawMaterialCostPaise, 0) / boms.length,
        );
  const itemsWithBom = new Set(boms.map((b) => b.itemKey)).size;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <PageHeader
        title="Bill of Materials"
        subtitle={loading ? "Loading…" : `${boms.length} BOMs`}
        trailing={
          <Tooltip label="Coming soon">
            <Button
              variant="primary"
              size="sm"
              disabled
              className="!pointer-events-auto"
            >
              + New BOM
            </Button>
          </Tooltip>
        }
      />

      <div className="grid grid-cols-2 gap-3 px-5 py-4 sm:grid-cols-4">
        <SummaryCard
          label="Active BOMs"
          value={loading ? "—" : String(activeCount)}
        />
        <SummaryCard
          label="Draft BOMs"
          value={loading ? "—" : String(draftCount)}
        />
        <SummaryCard
          label="Avg Material Cost"
          value={loading ? "—" : formatInr(avgMaterialCostPaise)}
        />
        <SummaryCard
          label="Items with BOM"
          value={loading ? "—" : String(itemsWithBom)}
        />
      </div>

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
        <div className="px-5 py-10 text-sm text-muted">Loading BOMs…</div>
      ) : null}

      {!loading && error ? (
        <div className="px-5 py-8">
          <EmptyState
            title="Could not load BOMs"
            description={error}
          />
        </div>
      ) : null}

      {!loading && !error && boms.length === 0 ? (
        <div className="px-5 py-8">
          <EmptyState
            title="No BOMs yet"
            description="Seed the Arka demo data or create a bill of materials to get started."
          />
        </div>
      ) : null}

      {!loading && !error && boms.length > 0 ? (
        <DataTable
          columns={columns}
          data={visible}
          keyExtractor={(row) => row._id}
          selectedKey={selectedId}
          onRowClick={(row) => {
            setSelectedId(row._id);
            setDetailTab("components");
          }}
          emptyTitle="No BOMs match this filter"
          emptyDescription="Try another status filter to see bill of materials."
        />
      ) : null}

      {selected ? (
        <section className="border-t border-line px-5 py-5">
          <div className="bg-surface border border-line rounded-[var(--radius-md)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-medium text-text">
                    {selected.itemName}
                  </h2>
                  <Badge tone={statusTone(selected.status)}>
                    {selected.status.charAt(0).toUpperCase() +
                      selected.status.slice(1)}
                  </Badge>
                  {selected.isDefault ? (
                    <Badge tone="accent">Default</Badge>
                  ) : null}
                </div>
                <p className="font-mono text-xs text-muted">{selected.bomNo}</p>
                <p className="text-sm text-muted">
                  Output {formatQty(selected.quantity, selected.uom)} ·{" "}
                  {itemTypeLabel(selected.itemKey)} · Total{" "}
                  <span className="font-mono tabular-nums text-text">
                    {formatRupees(selected.totalCostPaise / 100)}
                  </span>
                  /unit
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedId(null)}
              >
                Close
              </Button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {DETAIL_TABS.map((tab) => (
                <FilterChip
                  key={tab.id}
                  active={detailTab === tab.id}
                  onClick={() => setDetailTab(tab.id)}
                >
                  {tab.label}
                </FilterChip>
              ))}
            </div>

            <div className="mt-4 overflow-x-auto">
              {detailTab === "components" ? (
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                      <th className="px-2 py-2 font-medium">#</th>
                      <th className="px-2 py-2 font-medium">Item</th>
                      <th className="px-2 py-2 font-medium">Type</th>
                      <th className="px-2 py-2 font-medium text-right">Qty</th>
                      <th className="px-2 py-2 font-medium">UOM</th>
                      <th className="px-2 py-2 font-medium text-right">Rate</th>
                      <th className="px-2 py-2 font-medium text-right">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.lines.map((line) => (
                      <tr
                        key={`${selected._id}-c-${line.lineNo}`}
                        className="border-b border-line/60"
                      >
                        <td className="px-2 py-2.5 font-mono text-xs text-muted">
                          {line.lineNo}
                        </td>
                        <td className="px-2 py-2.5 text-text">
                          {line.itemName}
                        </td>
                        <td className="px-2 py-2.5">
                          <Badge tone={componentTypeTone(line.itemType)}>
                            {componentTypeLabel(line.itemType)}
                          </Badge>
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                          {Number.isInteger(line.quantity)
                            ? line.quantity
                            : line.quantity.toFixed(3).replace(/\.?0+$/, "")}
                        </td>
                        <td className="px-2 py-2.5 text-muted">{line.uom}</td>
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                          {formatRupees(line.ratePaise / 100)}
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                          {formatRupees(line.amountPaise / 100)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}

              {detailTab === "operations" ? (
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                      <th className="px-2 py-2 font-medium">Seq</th>
                      <th className="px-2 py-2 font-medium">Operation</th>
                      <th className="px-2 py-2 font-medium">Work Center</th>
                      <th className="px-2 py-2 font-medium text-right">
                        Time (min)
                      </th>
                      <th className="px-2 py-2 font-medium text-right">
                        Rate/hr
                      </th>
                      <th className="px-2 py-2 font-medium text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.operations.map((op) => (
                      <tr
                        key={`${selected._id}-op-${op.sequence}`}
                        className="border-b border-line/60"
                      >
                        <td className="px-2 py-2.5 font-mono text-xs text-muted">
                          {op.sequence}
                        </td>
                        <td className="px-2 py-2.5 text-text">
                          {op.operationName}
                        </td>
                        <td className="px-2 py-2.5 text-muted">
                          {op.workCenter}
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                          {op.timeMinutes}
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                          {formatRupees(op.hourlyRatePaise / 100)}
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                          {formatRupees(op.operatingCostPaise / 100)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}

              {detailTab === "costing" ? (
                <div className="max-w-md space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Raw Materials</span>
                    <span className="font-mono tabular-nums">
                      {formatRupees(selected.rawMaterialCostPaise / 100)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Operations</span>
                    <span className="font-mono tabular-nums">
                      {formatRupees(selected.operationCostPaise / 100)}
                    </span>
                  </div>
                  <div className="border-t border-line pt-3 flex items-center justify-between text-sm font-medium">
                    <span className="text-text">Total per unit</span>
                    <span className="font-mono tabular-nums text-text">
                      {formatRupees(selected.totalCostPaise / 100)}
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    Raw materials plus operations, rolled up per finished unit.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
