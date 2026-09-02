"use client";

import { useEffect, useMemo, useState } from "react";
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
import { formatQty } from "@/lib/format";
import { loadGraphSnapshot } from "@/lib/graph-data";
import {
  buildCatalogItems,
  type CatalogItem,
  type ItemCategory,
} from "./inventory-data";

type CategoryFilter = "All" | ItemCategory;

function numCell(value: number | null, low?: boolean) {
  if (value === null) return <span className="text-muted">—</span>;
  return (
    <span
      className={[
        "font-mono tabular-nums",
        low ? "text-risk" : "",
      ].join(" ")}
    >
      {value}
    </span>
  );
}

const columns: Column<CatalogItem>[] = [
  {
    key: "name",
    label: "Item Name",
    sortable: true,
            render: (row) => (
      <span
        className={[
          "inline-flex flex-col gap-0.5",
          row.lowStock ? "text-risk" : "",
        ].join(" ")}
      >
        <span className={row.lowStock ? "text-risk" : "text-text"}>
          {row.name}
        </span>
        <span className="font-mono text-xs text-muted">{row.key}</span>
      </span>
    ),
  },
  {
    key: "type",
    label: "Type",
    sortable: true,
    width: "110px",
    render: (row) => (
      <Badge tone={row.type === "SKU" ? "accent" : "muted"}>{row.type}</Badge>
    ),
  },
  {
    key: "unit",
    label: "Unit",
    sortable: true,
    width: "80px",
    render: (row) => <span className="text-muted">{row.unit}</span>,
  },
  {
    key: "onHand",
    label: "On Hand",
    sortable: true,
    align: "right",
    numeric: true,
    width: "100px",
    render: (row) => numCell(row.onHand),
  },
  {
    key: "reserved",
    label: "Reserved",
    sortable: true,
    align: "right",
    numeric: true,
    width: "100px",
    render: (row) => numCell(row.reserved),
  },
  {
    key: "available",
    label: "Available",
    sortable: true,
    align: "right",
    numeric: true,
    width: "110px",
    render: (row) =>
      row.available === null ? (
        <span className="text-muted">—</span>
      ) : (
        <span
          className={[
            "font-mono tabular-nums",
            row.lowStock ? "text-risk" : "text-teal",
          ].join(" ")}
        >
          {formatQty(row.available, row.unit)}
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
    render: (row) => numCell(row.reorderPoint),
  },
  {
    key: "lowStock",
    label: "Status",
    sortable: true,
    width: "140px",
    render: (row) => {
      if (row.lowStock) {
        return (
          <span className="inline-flex items-center gap-2">
            <StatusDot status="low" size="sm" />
            <Badge tone="risk">Low Stock</Badge>
          </span>
        );
      }
      if (row.available !== null && row.available > 0) {
        return (
          <span className="inline-flex items-center gap-2">
            <StatusDot status="ok" size="sm" />
            <span className="text-teal">In stock</span>
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-2">
          <StatusDot status="draft" size="sm" />
          <span className="text-muted">—</span>
        </span>
      );
    },
  },
];

export function ItemsPage({
  onNavigate,
}: {
  onNavigate: (view: string) => void;
}) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<CategoryFilter>("All");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const snapshot = await loadGraphSnapshot();
        if (cancelled) return;
        setItems(buildCatalogItems(snapshot));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load items");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const categoriesPresent = useMemo(() => {
    const set = new Set(items.map((i) => i.category));
    return set;
  }, [items]);

  const showFilters =
    categoriesPresent.has("Raw Materials") &&
    categoriesPresent.has("Finished Goods");

  const filtered = useMemo(() => {
    if (category === "All") return items;
    return items.filter((i) => i.category === category);
  }, [items, category]);

  const lowCount = filtered.filter((i) => i.lowStock).length;
  const subtitle = loading
    ? "Loading…"
    : `${filtered.length} ${filtered.length === 1 ? "item" : "items"}${
        lowCount > 0 ? ` · ${lowCount} low stock` : ""
      }`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <PageHeader
        title="Items"
        subtitle={subtitle}
        trailing={
          <Button
            variant="primary"
            size="sm"
            onClick={() => onNavigate("new-item")}
          >
            + New Item
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-3 px-5 py-5">
          <div className="h-8 w-64 animate-pulse rounded-[var(--radius-sm)] bg-surface-2" />
          <div className="h-64 animate-pulse rounded-[var(--radius-md)] bg-surface-2" />
        </div>
      ) : null}

      {!loading && error ? (
        <div className="px-5 py-8">
          <EmptyState
            title="Couldn’t load items"
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
          {showFilters ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
              {(
                ["All", "Raw Materials", "Finished Goods"] as CategoryFilter[]
              ).map((c) => (
                <FilterChip
                  key={c}
                  active={category === c}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </FilterChip>
              ))}
            </div>
          ) : null}

          <DataTable
            columns={columns}
            data={filtered}
            keyExtractor={(row) => row.key}
            selectedKey={selectedKey}
            onRowClick={(row) => {
              setSelectedKey(row.key);
              onNavigate(row.key);
            }}
            emptyTitle="No items"
            emptyDescription="SKU and Material nodes will appear here once they exist on the graph."
          />
        </>
      ) : null}
    </div>
  );
}
