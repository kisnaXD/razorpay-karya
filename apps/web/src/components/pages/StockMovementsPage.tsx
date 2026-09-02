"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  FilterChip,
  PageHeader,
  type Column,
} from "@/components/ui";
import { loadGraphSnapshot } from "@/lib/graph-data";
import {
  buildStockMovements,
  type MovementType,
  type StockMovementRow,
} from "./inventory-data";

type TypeFilter = "All" | MovementType;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const columns: Column<StockMovementRow>[] = [
  {
    key: "date",
    label: "Date",
    sortable: true,
    width: "120px",
    render: (row) => (
      <span className="font-mono text-sm tabular-nums text-muted">
        {formatDate(row.date)}
      </span>
    ),
  },
  {
    key: "itemLabel",
    label: "Item",
    sortable: true,
    render: (row) => (
      <span className="inline-flex flex-col gap-0.5">
        <span className="text-text">{row.itemLabel}</span>
        <span className="font-mono text-xs text-muted">{row.itemKey}</span>
      </span>
    ),
  },
  {
    key: "type",
    label: "Type",
    sortable: true,
    width: "90px",
    render: (row) => (
      <Badge tone={row.type === "In" ? "success" : "warn"}>{row.type}</Badge>
    ),
  },
  {
    key: "qty",
    label: "Qty",
    sortable: true,
    align: "right",
    numeric: true,
    width: "90px",
    render: (row) => (
      <span
        className={[
          "font-mono tabular-nums",
          row.type === "In" ? "text-teal" : "text-warn",
        ].join(" ")}
      >
        {row.type === "In" ? "+" : "−"}
        {row.qty}
      </span>
    ),
  },
  {
    key: "reference",
    label: "Reference",
    sortable: true,
    render: (row) => (
      <span className="font-mono text-sm text-text">{row.reference}</span>
    ),
  },
  {
    key: "warehouse",
    label: "Warehouse",
    sortable: true,
    width: "140px",
    render: (row) => row.warehouse ?? "—",
  },
];

export function StockMovementsPage({
  onNavigate,
}: {
  onNavigate: (view: string) => void;
}) {
  const [rows, setRows] = useState<StockMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("All");
  const [itemFilter, setItemFilter] = useState<string>("All");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const snapshot = await loadGraphSnapshot();
        if (cancelled) return;
        setRows(buildStockMovements(snapshot));
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load stock movements",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const itemOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.itemKey, row.itemLabel);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (typeFilter !== "All" && row.type !== typeFilter) return false;
      if (itemFilter !== "All" && row.itemKey !== itemFilter) return false;
      if (fromDate && row.date) {
        if (row.date.slice(0, 10) < fromDate) return false;
      }
      if (toDate && row.date) {
        if (row.date.slice(0, 10) > toDate) return false;
      }
      if ((fromDate || toDate) && !row.date) return false;
      return true;
    });
  }, [rows, typeFilter, itemFilter, fromDate, toDate]);

  const subtitle = loading
    ? "Loading…"
    : `${filtered.length} movement${filtered.length === 1 ? "" : "s"} · from shipments, POs & sales orders`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <PageHeader title="Stock Movements" subtitle={subtitle} />

      {loading ? (
        <div className="space-y-3 px-5 py-5">
          <div className="h-10 w-full max-w-xl animate-pulse rounded-[var(--radius-sm)] bg-surface-2" />
          <div className="h-64 animate-pulse rounded-[var(--radius-md)] bg-surface-2" />
        </div>
      ) : null}

      {!loading && error ? (
        <div className="px-5 py-8">
          <EmptyState
            title="Couldn’t load stock movements"
            description={error}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            }
          />
        </div>
      ) : null}

      {!loading && !error ? (
        <>
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {(["All", "In", "Out"] as TypeFilter[]).map((t) => (
                <FilterChip
                  key={t}
                  active={typeFilter === t}
                  onClick={() => setTypeFilter(t)}
                >
                  {t === "All" ? "All types" : t}
                </FilterChip>
              ))}
            </div>

            <label className="flex items-center gap-2 text-sm text-muted">
              Item
              <select
                value={itemFilter}
                onChange={(e) => setItemFilter(e.target.value)}
                className="rounded-[var(--radius-sm)] border border-line bg-surface-2 px-2 py-1 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
              >
                <option value="All">All items</option>
                {itemOptions.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-muted">
              From
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="rounded-[var(--radius-sm)] border border-line bg-surface-2 px-2 py-1 font-mono text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-muted">
              To
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="rounded-[var(--radius-sm)] border border-line bg-surface-2 px-2 py-1 font-mono text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
              />
            </label>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              title="No stock movements found"
              description="Movements are synthesized from Shipment (FULFILLS), ORDER_CONTAINS, and SHIPS edges on the graph. Seed POs, SOs, and inbound shipments to populate this ledger."
            />
          ) : (
            <DataTable
              columns={columns}
              data={filtered}
              keyExtractor={(row) => row.id}
              selectedKey={selectedKey}
              onRowClick={(row) => {
                setSelectedKey(row.id);
                onNavigate(row.itemKey);
              }}
              emptyTitle="No matching movements"
              emptyDescription="Try clearing filters to see all synthesized stock movements."
            />
          )}
        </>
      ) : null}
    </div>
  );
}
