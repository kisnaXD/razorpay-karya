"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  type Column,
} from "@/components/ui";
import { formatInr } from "@/lib/format";
import { loadGraphSnapshot } from "@/lib/graph-data";
import {
  buildStockLevelRows,
  type StockHealth,
  type StockLevelRow,
} from "./inventory-data";

function healthClass(health: StockHealth): string {
  if (health === "below") return "text-risk";
  if (health === "near") return "text-warn";
  return "text-teal";
}

function healthLabel(health: StockHealth): string {
  if (health === "below") return "Below reorder";
  if (health === "near") return "Near reorder";
  return "Healthy";
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "risk" | "teal" | "muted";
}) {
  const valueClass =
    tone === "risk"
      ? "text-risk"
      : tone === "teal"
        ? "text-teal"
        : "text-text";
  return (
    <div className="bg-surface border border-line rounded-[var(--radius-md)] p-4">
      <p className="text-sm uppercase tracking-wider text-muted">{label}</p>
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

const columns: Column<StockLevelRow>[] = [
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
    key: "warehouse",
    label: "Warehouse/Location",
    sortable: true,
    width: "160px",
  },
  {
    key: "onHand",
    label: "On Hand",
    sortable: true,
    align: "right",
    numeric: true,
    width: "100px",
    render: (row) => (
      <span className="font-mono tabular-nums">{row.onHand}</span>
    ),
  },
  {
    key: "reserved",
    label: "Reserved",
    sortable: true,
    align: "right",
    numeric: true,
    width: "100px",
    render: (row) => (
      <span className="font-mono tabular-nums">{row.reserved}</span>
    ),
  },
  {
    key: "available",
    label: "Available",
    sortable: true,
    align: "right",
    numeric: true,
    width: "120px",
    render: (row) => (
      <span
        className={[
          "inline-flex items-center justify-end gap-2 font-mono tabular-nums",
          healthClass(row.health),
        ].join(" ")}
      >
        {row.available}
        {row.health === "below" ? <Badge tone="risk">Low</Badge> : null}
      </span>
    ),
  },
  {
    key: "reorderPoint",
    label: "Reorder Point",
    sortable: true,
    align: "right",
    numeric: true,
    width: "120px",
    render: (row) =>
      row.reorderPoint !== null ? (
        <span className="font-mono tabular-nums">{row.reorderPoint}</span>
      ) : (
        <span className="text-muted">—</span>
      ),
  },
  {
    key: "health",
    label: "Health",
    sortable: true,
    width: "130px",
    render: (row) => (
      <span className={healthClass(row.health)}>{healthLabel(row.health)}</span>
    ),
  },
];

export function StockLevelsPage({
  onNavigate,
}: {
  onNavigate: (view: string) => void;
}) {
  const [rows, setRows] = useState<StockLevelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const snapshot = await loadGraphSnapshot();
        if (cancelled) return;
        setRows(buildStockLevelRows(snapshot));
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load stock levels",
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

  const summary = useMemo(() => {
    const lowStockCount = rows.filter((r) => r.health === "below").length;
    const totalValue = rows.reduce(
      (sum, r) => sum + (r.valueInPaise ?? 0),
      0,
    );
    const hasValue = rows.some((r) => r.valueInPaise !== null);
    return {
      totalItems: rows.length,
      lowStockCount,
      totalValue,
      hasValue,
    };
  }, [rows]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <PageHeader
        title="Stock Levels"
        subtitle={
          loading
            ? "Loading…"
            : `Sorted by available · ${summary.lowStockCount} below reorder`
        }
      />

      {loading ? (
        <div className="space-y-3 px-5 py-5">
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-[var(--radius-md)] bg-surface-2"
              />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-[var(--radius-md)] bg-surface-2" />
        </div>
      ) : null}

      {!loading && error ? (
        <div className="px-5 py-8">
          <EmptyState
            title="Couldn’t load stock levels"
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
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="grid grid-cols-3 gap-3 px-5 py-5">
            <SummaryCard
              label="Total Items"
              value={String(summary.totalItems)}
            />
            <SummaryCard
              label="Low Stock Count"
              value={String(summary.lowStockCount)}
              tone={summary.lowStockCount > 0 ? "risk" : "teal"}
            />
            <SummaryCard
              label="Total Value"
              value={
                summary.hasValue ? formatInr(summary.totalValue) : "—"
              }
            />
          </div>

          <DataTable
            columns={columns}
            data={rows}
            keyExtractor={(row) => row.key}
            selectedKey={selectedKey}
            onRowClick={(row) => {
              setSelectedKey(row.key);
              onNavigate(row.itemKey);
            }}
            emptyTitle="No stock positions"
            emptyDescription="Stock nodes with on-hand quantities will show up here."
          />
        </div>
      ) : null}
    </div>
  );
}
