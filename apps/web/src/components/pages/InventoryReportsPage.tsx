"use client";

import { useEffect, useMemo, useState } from "react";
import { loadGraphSnapshot } from "@/lib/graph-data";
import { formatCash, formatQty } from "@/lib/format";
import {
  buildInventoryRows,
  type InventoryRow,
} from "@/components/tables/inventory-columns";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  StatusDot,
  type Column,
} from "@/components/ui";

function isLowStock(row: InventoryRow): boolean {
  if (row.reorderFlag) return true;
  if (row.available === null) return false;
  if (row.available <= 0) return true;
  return row.reserved !== null && row.available < row.reserved;
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-line rounded-[var(--radius-md)] p-4">
      <p className="text-sm uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-2 font-mono text-xl font-medium tabular-nums text-text">
        {value}
      </p>
    </div>
  );
}

type AlertRow = InventoryRow & { alert: string };

const alertColumns: Column<AlertRow>[] = [
  {
    key: "label",
    label: "Item",
    render: (row) => (
      <span className="text-text">{row.label}</span>
    ),
  },
  {
    key: "kind",
    label: "Kind",
    width: "100px",
    render: (row) => <Badge tone="muted">{row.kind}</Badge>,
  },
  {
    key: "available",
    label: "Available",
    align: "right",
    numeric: true,
    width: "110px",
    render: (row) =>
      row.available != null ? (
        <span className="font-mono tabular-nums text-risk">
          {formatQty(row.available)}
        </span>
      ) : (
        "—"
      ),
  },
  {
    key: "alert",
    label: "Alert",
    width: "140px",
    render: (row) => (
      <span className="inline-flex items-center gap-2 text-sm text-risk">
        <StatusDot status="low" size="sm" />
        {row.alert}
      </span>
    ),
  },
];

export function InventoryReportsPage({
  onNavigate,
}: {
  onNavigate: (view: string) => void;
}) {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [stockValuePaise, setStockValuePaise] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const snapshot = await loadGraphSnapshot();
        if (cancelled) return;
        const inventoryRows = buildInventoryRows(snapshot);

        let value = 0;
        for (const node of snapshot.nodes.filter((n) => n.type === "Stock")) {
          const onHand =
            typeof node.props.on_hand === "number" ? node.props.on_hand : 0;
          const stockOf = snapshot.edges.find(
            (e) => e.type === "STOCK_OF" && e.fromId === node._id,
          );
          const sku = stockOf
            ? snapshot.nodeById.get(stockOf.toId)
            : undefined;
          const price =
            sku && typeof sku.props.priceInPaise === "number"
              ? sku.props.priceInPaise
              : 0;
          value += onHand * price;
        }

        setRows(inventoryRows);
        setStockValuePaise(value);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load inventory",
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

  const lowStock = useMemo(
    () =>
      rows
        .filter(isLowStock)
        .map((row) => ({
          ...row,
          alert: row.reorderFlag ? "Below reorder" : "Low stock",
        })),
    [rows],
  );

  const byCategory = useMemo(() => {
    const counts: Record<InventoryRow["kind"], number> = {
      SKU: 0,
      Material: 0,
      Stock: 0,
    };
    for (const row of rows) {
      counts[row.kind] += 1;
    }
    return counts;
  }, [rows]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <PageHeader
        title="Inventory Reports"
        subtitle="Stock health derived from graph SKU, material, and stock nodes."
        trailing={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigate("items")}
          >
            Items →
          </Button>
        }
      />

      {loading ? (
        <p className="px-5 py-6 text-sm text-muted">Loading inventory reports…</p>
      ) : null}

      {!loading && error ? (
        <div className="px-5 py-8">
          <EmptyState
            title="Couldn’t load inventory reports"
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
        <div className="space-y-5 px-5 py-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <KpiCard label="Total Items" value={String(rows.length)} />
            <KpiCard
              label="Low Stock Items"
              value={String(lowStock.length)}
            />
            <KpiCard
              label="Total Stock Value"
              value={stockValuePaise > 0 ? formatCash(stockValuePaise) : "—"}
            />
          </div>

          <section className="bg-surface border border-line rounded-[var(--radius-md)] p-4">
            <h2 className="mb-3 text-md font-medium text-text">
              Items by category
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  ["SKU", byCategory.SKU],
                  ["Material", byCategory.Material],
                  ["Stock", byCategory.Stock],
                ] as const
              ).map(([label, count]) => (
                <div
                  key={label}
                  className="rounded-[var(--radius-md)] border border-line bg-surface-2/40 px-3 py-3"
                >
                  <p className="text-xs uppercase tracking-wider text-muted">
                    {label}
                  </p>
                  <p className="mt-1 font-mono text-lg tabular-nums text-text">
                    {count}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-surface border border-line rounded-[var(--radius-md)] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-md font-medium text-text">Low stock alerts</h2>
              <Badge tone={lowStock.length > 0 ? "risk" : "success"}>
                {lowStock.length} alert{lowStock.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <DataTable
              columns={alertColumns}
              data={lowStock}
              keyExtractor={(row) => row.key}
              onRowClick={() => onNavigate("stock-levels")}
              emptyTitle="No low-stock alerts"
              emptyDescription="Items below reorder point or with zero available stock will appear here."
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}
